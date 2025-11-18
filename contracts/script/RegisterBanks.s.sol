// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BankRegistry.sol";

contract RegisterBanks is Script {
    function run() external {
        uint256 adminPK = vm.envUint("PRIVATE_KEY");

        address registryAddr = vm.envAddress("BANK_REGISTRY_ADDRESS");

        string memory kCode = "K_BANK";
        string memory jCode = "J_BANK";

        address kBank = vm.envAddress("K_BANK_ADDRESS");
        address jBank = vm.envAddress("J_BANK_ADDRESS");

        vm.startBroadcast(adminPK);

        BankRegistry reg = BankRegistry(registryAddr);

        reg.registerBank(kCode, kBank);
        reg.registerBank(jCode, jBank);

        vm.stopBroadcast();
    }
}