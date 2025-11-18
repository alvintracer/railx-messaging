// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RemittanceOrder721.sol";

contract DeployRemittanceOrder is Script {
    function run() external {
        // PRIVATE_KEY를 환경변수로부터 읽음
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        RemittanceOrder721 contractInstance = new RemittanceOrder721();

        vm.stopBroadcast();

        console2.log("RemittanceOrder721 deployed to:", address(contractInstance));
    }
}
