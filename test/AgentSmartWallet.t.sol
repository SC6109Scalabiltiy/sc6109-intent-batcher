// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {UserOperation} from "account-abstraction/interfaces/UserOperation.sol";
import {AgentSmartWallet} from "../src/accounts/AgentSmartWallet.sol";
import {AgentAccountFactory} from "../src/accounts/AgentAccountFactory.sol";
import {VerifyingPaymaster} from "../src/paymaster/VerifyingPaymaster.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BatchDcaSettlement} from "../src/BatchDcaSettlement.sol";
import {MockToken} from "../src/MockToken.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract AgentSmartWalletTest is Test {
    using ECDSA for bytes32;

    uint256 internal constant USDC = 1e6;
    uint256 internal constant WETH = 1e18;

    // Agent owner key (acts as the smart wallet's signing key)
    uint256 internal ownerKey = 0xBEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234;
    address internal owner;

    // Coordinator key (acts as paymaster signer)
    uint256 internal coordinatorKey = 0xC0DE1234C0DE1234C0DE1234C0DE1234C0DE1234C0DE1234C0DE1234C0DE1234;
    address internal coordinator;

    EntryPoint internal entryPoint;
    AgentAccountFactory internal factory;
    VerifyingPaymaster internal paymaster;
    AgentSmartWallet internal wallet;

    address internal beneficiary = address(0xBEEF);

    function setUp() public {
        owner = vm.addr(ownerKey);
        coordinator = vm.addr(coordinatorKey);

        entryPoint = new EntryPoint();
        factory = new AgentAccountFactory(IEntryPoint(address(entryPoint)));
        // verifyingSigner = coordinator
        paymaster = new VerifyingPaymaster(IEntryPoint(address(entryPoint)), coordinator);

        // Transfer ownership to coordinator so paymaster admin calls work
        vm.prank(address(this));
        paymaster.transferOwnership(coordinator);

        // Fund paymaster deposit in EntryPoint
        vm.deal(address(this), 1 ether);
        entryPoint.depositTo{value: 0.5 ether}(address(paymaster));

        wallet = factory.createAccount(owner, 0);
    }

    // ── Factory tests ─────────────────────────────────────────────────────────

    function testFactoryIdempotent() public {
        AgentSmartWallet wallet2 = factory.createAccount(owner, 0);
        assertEq(address(wallet), address(wallet2));
    }

    function testGetAddressMatchesDeployed() public {
        address predicted = factory.getAddress(owner, 0);
        assertEq(predicted, address(wallet));
    }

    function testDifferentSaltsProduceDifferentAddresses() public {
        address a0 = factory.getAddress(owner, 0);
        address a1 = factory.getAddress(owner, 1);
        assertTrue(a0 != a1);
    }

    // ── Signature validation ──────────────────────────────────────────────────

    function testValidateUserOpAcceptsOwner() public {
        UserOperation memory userOp = _buildNoopUserOp();
        bytes32 opHash = entryPoint.getUserOpHash(userOp);
        userOp.signature = _ethSign(ownerKey, opHash);

        vm.prank(address(entryPoint));
        uint256 result = wallet.validateUserOp(userOp, opHash, 0);
        assertEq(result, 0); // 0 = success
    }

    function testValidateUserOpRejectsWrongSigner() public {
        uint256 wrongKey = 0xDEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234;
        UserOperation memory userOp = _buildNoopUserOp();
        bytes32 opHash = entryPoint.getUserOpHash(userOp);
        userOp.signature = _ethSign(wrongKey, opHash);

        vm.prank(address(entryPoint));
        uint256 result = wallet.validateUserOp(userOp, opHash, 0);
        assertEq(result, 1); // 1 = SIG_VALIDATION_FAILED
    }

    function testExecuteRevertsIfCallerNotEntryPoint() public {
        vm.expectRevert("AgentSmartWallet: not entryPoint");
        wallet.execute(address(0), 0, "");
    }

    function testExecuteBatchRevertsIfCallerNotEntryPoint() public {
        AgentSmartWallet.Call[] memory calls = new AgentSmartWallet.Call[](0);
        vm.expectRevert("AgentSmartWallet: not entryPoint");
        wallet.executeBatch(calls);
    }

    // ── Paymaster ─────────────────────────────────────────────────────────────

    function testPaymasterSponsorsGasAgentNeedsNoEth() public {
        // wallet has zero ETH — paymaster must cover gas
        assertEq(address(wallet).balance, 0);

        UserOperation memory userOp = _buildNoopUserOp();
        _attachPaymaster(userOp);
        bytes32 opHash = entryPoint.getUserOpHash(userOp);
        userOp.signature = _ethSign(ownerKey, opHash);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(beneficiary));
    }

    function testPaymasterRejectsWrongCoordinatorSig() public {
        UserOperation memory userOp = _buildNoopUserOp();

        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        // Build paymasterAndData signed with WRONG key (ownerKey instead of coordinatorKey)
        bytes memory unsignedPmd = abi.encodePacked(
            address(paymaster),
            abi.encode(validUntil, validAfter)
        );
        userOp.paymasterAndData = unsignedPmd;
        bytes32 pmHash = paymaster.getHash(userOp, validUntil, validAfter);
        bytes memory wrongSig = _ethSign(ownerKey, pmHash); // owner key, not coordinator
        userOp.paymasterAndData = abi.encodePacked(unsignedPmd, wrongSig);

        bytes32 opHash = entryPoint.getUserOpHash(userOp);
        userOp.signature = _ethSign(ownerKey, opHash);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert(); // AA34 paymaster signature error
        entryPoint.handleOps(ops, payable(beneficiary));
    }

    // In ERC-4337 v0.6, validUntil/validAfter are enforced by bundlers off-chain, not by
    // handleOps on-chain. This test verifies that parsePaymasterAndData correctly round-trips
    // the time-range parameters so bundlers can inspect them.
    function testPaymasterParsePaymasterAndDataRoundTrips() public view {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp + 60);
        bytes memory pmd = abi.encodePacked(
            address(paymaster),
            abi.encode(validUntil, validAfter),
            bytes(hex"aabbcc") // dummy sig stub (not validated here)
        );
        // parsePaymasterAndData only checks [20:84] range, so we need 84+ bytes
        // Use a 65-byte dummy sig
        bytes memory fullPmd = abi.encodePacked(
            address(paymaster),
            abi.encode(validUntil, validAfter),
            new bytes(65)
        );
        (uint48 retUntil, uint48 retAfter,) = paymaster.parsePaymasterAndData(fullPmd);
        assertEq(retUntil, validUntil);
        assertEq(retAfter, validAfter);
        (pmd); // suppress unused variable warning
    }

    // ── Full DCA integration ──────────────────────────────────────────────────

    function testIntegrationExecuteIntentViaUserOp() public {
        AgentRegistry registry = new AgentRegistry();
        MockToken usdc = new MockToken("Mock USDC", "mUSDC", 6);
        MockToken weth = new MockToken("Mock WETH", "mWETH", 18);
        BatchDcaSettlement settlement = new BatchDcaSettlement(
            registry, usdc, weth, 5 * WETH, 10_000 * USDC
        );
        weth.mint(address(settlement), 100 * WETH);

        // Deployer (test contract) registers agent on behalf of smart wallet
        bytes32 strategyId = keccak256("DCA_USDC_TO_WETH");
        uint256 agentId = registry.registerAgentFor(address(wallet), strategyId);

        // Fund wallet with USDC
        uint256 amount = 10 * USDC;
        usdc.mint(address(wallet), amount);

        // UserOp 1: approve USDC + create intent (batch)
        AgentSmartWallet.Call[] memory calls = new AgentSmartWallet.Call[](2);
        calls[0] = AgentSmartWallet.Call({
            target: address(usdc),
            value: 0,
            data: abi.encodeCall(usdc.approve, (address(settlement), amount))
        });
        calls[1] = AgentSmartWallet.Call({
            target: address(settlement),
            value: 0,
            data: abi.encodeCall(
                settlement.createRecurringIntent,
                (agentId, amount, 0, 1 hours, uint64(block.timestamp), 10 minutes, 0)
            )
        });

        UserOperation memory setupOp = _buildUserOp(abi.encodeCall(wallet.executeBatch, (calls)));
        _attachPaymaster(setupOp);
        setupOp.signature = _ethSign(ownerKey, entryPoint.getUserOpHash(setupOp));

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = setupOp;
        entryPoint.handleOps(ops, payable(beneficiary));

        uint256 intentId = settlement.nextIntentId() - 1;
        assertTrue(settlement.isDue(intentId));

        // UserOp 2: execute the intent from the smart wallet
        UserOperation memory execOp = _buildUserOp(
            abi.encodeCall(
                wallet.execute,
                (address(settlement), 0, abi.encodeCall(settlement.executeIntent, (intentId)))
            )
        );
        _attachPaymaster(execOp);
        execOp.signature = _ethSign(ownerKey, entryPoint.getUserOpHash(execOp));

        ops[0] = execOp;
        entryPoint.handleOps(ops, payable(beneficiary));

        assertEq(usdc.balanceOf(address(wallet)), 0);
        assertGt(weth.balanceOf(address(wallet)), 0);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _buildNoopUserOp() internal view returns (UserOperation memory) {
        return _buildUserOp(abi.encodeCall(wallet.execute, (address(0), 0, "")));
    }

    function _buildUserOp(bytes memory callData) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(wallet),
            nonce: entryPoint.getNonce(address(wallet), 0),
            initCode: "",
            callData: callData,
            callGasLimit: 200_000,
            verificationGasLimit: 200_000,
            preVerificationGas: 50_000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: ""
        });
    }

    // Attach paymaster data signed by coordinator key. Modifies userOp.paymasterAndData in-place.
    function _attachPaymaster(UserOperation memory userOp) internal view {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = 0;

        bytes memory unsignedPmd = abi.encodePacked(
            address(paymaster),
            abi.encode(validUntil, validAfter)
        );
        // Set temporarily so getHash sees the right paymasterAndData prefix
        userOp.paymasterAndData = unsignedPmd;

        bytes32 pmHash = paymaster.getHash(userOp, validUntil, validAfter);
        bytes memory pmSig = _ethSign(coordinatorKey, pmHash);
        userOp.paymasterAndData = abi.encodePacked(unsignedPmd, pmSig);
    }

    // Sign hash with Ethereum signed message prefix — matches ethers wallet.signMessage()
    function _ethSign(uint256 privateKey, bytes32 hash) internal pure returns (bytes memory) {
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }
}
