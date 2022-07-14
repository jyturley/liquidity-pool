//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "./SpaceCoin.sol";
import "./SpacePool.sol";

/// @notice Utility functions used in the Space contracts
library SpaceLibrary {
    /// @notice Transfers ETH to address. Reverts if it does not succeed.
    function safeTransferETH(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Unable to transfer ETH");
    }

    /// @notice A transferFrom() wrapper for SpaceCoin.
    /// Reverts if it does not succeed.
    function safeTransferFromSPC(
        SpaceCoin spaceCoin,
        address from,
        address to,
        uint256 numTokens
    ) internal {
        bool success = spaceCoin.transferFrom(from, to, numTokens);
        require(success, "Unable to transferFrom SPC");
    }

    /// @notice A transfer() wrapper for SpaceCoin.
    /// Reverts if it does not succeed.
    function safeTransferSPC(
        SpaceCoin spaceCoin,
        address to,
        uint256 numTokens
    ) internal {
        bool success = spaceCoin.transfer(to, numTokens);
        require(success, "Unable to transfer SPC");
    }

    /// @notice A transferFrom() wrapper for SpacePool.
    /// Reverts if it does not succeed.
    function safeTransferFromSPL(
        SpacePool pool,
        address from,
        address to,
        uint256 numTokens
    ) internal {
        bool success = pool.transferFrom(from, to, numTokens);
        require(success, "Unable to transferFrom SPL");
    }

    /// @notice Returns the square root of a given uint256.
    /// @param y The number to square root.
    /// @dev Uses the 'Babylonian Method' of efficiently computing square roots.
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// @notice Returns the min of x and y.
    function min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }
}
