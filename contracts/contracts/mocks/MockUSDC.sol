// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Standard ERC20 token with 6 decimals simulating USDC on Arc Testnet.
 * Includes a public faucet for testnet and testing purposes.
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant _DECIMALS = 6;

    constructor() ERC20("USD Coin", "USDC") Ownable(msg.sender) {
        // Mint initial 1,000,000 USDC to deployer
        _mint(msg.sender, 1_000_000 * 10 ** _DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Free faucet for testers to obtain testnet USDC on Arc
     */
    function faucet(address to) external {
        // Faucet sends 500 USDC per call
        _mint(to, 500 * 10 ** _DECIMALS);
    }
}
