// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RemittanceOrder721.sol";

contract GrantBankRole is Script {
    function run() external {
        uint256 adminPrivateKey = vm.envUint("PRIVATE_KEY"); // DEFAULT_ADMIN_ROLE 가진 계정
        address contractAddr = vm.envAddress("VITE_RAILX_REMITTANCE_ADDRESS");
        address kBank = vm.envAddress("K_BANK_ADDRESS");
        address jBank = vm.envAddress("J_BANK_ADDRESS");

        vm.startBroadcast(adminPrivateKey);

        RemittanceOrder721 remit = RemittanceOrder721(contractAddr);

        bytes32 bankRole = remit.BANK_ROLE();

        remit.grantRole(bankRole, kBank);
        remit.grantRole(bankRole, jBank);

        vm.stopBroadcast();
    }
}
