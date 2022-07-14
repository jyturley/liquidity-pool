//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "./SpaceCoin.sol";
import "./SpacePool.sol";
import "./SpaceLibrary.sol";

/// @notice Router contract that interacts with the ETH-SPC liquidity pool.
/// @dev Users of the pool should interface with this contract instead of the pool.
contract SpaceRouter {
    /// The liquidity pool takes a 1% fee per swap.
    uint256 public constant SWAP_FEE_PERCENT = 1;

    /// ETH-SPC liquidity pool contract
    SpacePool public immutable pool;

    /// SPC ERC20 token contract
    SpaceCoin public immutable spaceCoin;

    /// @notice Constructor to set immutable addresses
    constructor(SpacePool _pool, SpaceCoin _spaceCoin) {
        pool = _pool;
        spaceCoin = _spaceCoin;
    }

    /// @notice Returns the price of SPC per 1 ether.
    /// @dev Swap fees are taken into account.
    function getCurrentSPCToETHPrice() external view returns (uint256) {
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        return _calculateReturnWithSwapFee(1 ether, reserveETH, reserveSPC);
    }

    /// @notice Add ETH and SPC and get LP tokens in return.
    /// @param ethMin The min acceptable ETH to be deposited. Reverts if not met.
    /// @param spcDesired  The max amount of SPC to be deposited.
    /// @param spcMin The min acceptable SPC to be deposited. Reverts if not met.
    /// @param to The account the minted LP tokens will be sent to.
    /// @dev msg.value is used to specify the max amount of ETH to be deposited.
    /// @dev Requires msg.sender approval to transfer SPC to the pool
    function addLiquidity(
        uint256 ethMin,
        uint256 spcDesired,
        uint256 spcMin,
        address to
    )
        external
        payable
        returns (
            uint256 inETH,
            uint256 inSPC,
            uint256 outLiquidity
        )
    {
        require(msg.value > 0, "Must input a positive ETH amount");
        (inETH, inSPC) = _getOptimalAmounts(spcDesired, ethMin, spcMin);

        SpaceLibrary.safeTransferFromSPC(
            spaceCoin,
            msg.sender,
            address(pool),
            inSPC
        );

        require(msg.value >= inETH, "Not enough ETH sent to function");
        uint256 amountMinted = pool.mint{value: inETH}(to);
        if (amountMinted > inETH) {
            SpaceLibrary.safeTransferETH(msg.sender, msg.value - inETH);
        }

        return (inETH, inSPC, amountMinted);
    }

    /// @notice Take ETH and SPC out of pool in exchange for the tokens.
    /// @param inLPTokenAmount Amount of liquidity tokens to return.
    /// @param ethMin The floor ETH the caller expects to get back. Reverts if not met.
    /// @param spcMin The floor SPC the caller expects to get back. Reverts if not met.
    /// @dev ETH and SPC are sent directly from SpacePool to caller. Not from here.
    function removeLiquidity(
        uint256 inLPTokenAmount,
        uint256 ethMin,
        uint256 spcMin,
        address to
    ) external returns (uint256 outETH, uint256 outSPC) {
        require(inLPTokenAmount > 0, "Need LPTokens to remove liquidity");
        SpaceLibrary.safeTransferFromSPL(
            pool,
            msg.sender,
            address(pool),
            inLPTokenAmount
        );
        (outETH, outSPC) = pool.burn(to);
        require(outETH >= ethMin, "ETH minimum too high");
        require(outSPC >= spcMin, "SPC minimum too high");
    }

    /// @notice Given a specified amount of ETH, get SPC back based on market conditions.
    /// @param outSPCMin Minimum amount of SPC to be returned. Revert if not true.
    /// @param to Address where the SPC should be sent to.
    /// @dev ETH must be passed into this function.
    function swapExactETHforSPC(uint256 outSPCMin, address to)
        external
        payable
        returns (uint256 outSPC)
    {
        require(
            !spaceCoin.transferTaxActive(),
            "SpaceCoin transfer tax must not be active"
        );
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        outSPC = _calculateReturnWithSwapFee(msg.value, reserveETH, reserveSPC);
        require(outSPC >= outSPCMin, "Did not meet SPC minimum conditions");

        pool.swap{value: msg.value}(0, outSPC, to);
        return outSPC;
    }

    /// @notice Given a specified amount of SPC, get ETH back based on market conditions.
    /// @param inSPC Amount of SPC to deposit for the swap.
    /// @param outETHMin Minimum amount of ETH to be returned. Revert if not true.
    /// @param to Address where the ETH should be sent to.
    function swapExactSPCforETH(
        uint256 inSPC,
        uint256 outETHMin,
        address to
    ) external returns (uint256 outETH) {
        require(
            !spaceCoin.transferTaxActive(),
            "SpaceCoin transfer tax must not be active"
        );
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        outETH = _calculateReturnWithSwapFee(inSPC, reserveSPC, reserveETH);
        require(outETH >= outETHMin, "Did not meet ETH minimum conditions");
        SpaceLibrary.safeTransferFromSPC(
            spaceCoin,
            msg.sender,
            address(pool),
            inSPC
        );
        pool.swap(outETH, 0, to);
        return outETH;
    }

    /// @notice Given a specified amount of ETH, get SPC back based on market conditions.
    /// @param outSPCMin Minimum amount of SPC to be returned. Revert if not true.
    /// @param to Address where the SPC should be sent to.
    /// @dev User should use this function when tax is active instead of swapExactETHforSPC().
    function swapExactETHforSPCWithTransferTax(uint256 outSPCMin, address to)
        external
        payable
        returns (uint256 outSPC)
    {
        require(
            spaceCoin.transferTaxActive(),
            "SpaceCoin transfer tax must be active"
        );
        uint256 balanceBefore = spaceCoin.balanceOf(to);
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        outSPC = _calculateReturnWithSwapFee(msg.value, reserveETH, reserveSPC);
        pool.swap{value: msg.value}(0, outSPC, to);
        require(
            spaceCoin.balanceOf(to) - balanceBefore >= outSPCMin,
            "Does not meet SPC minimum conditions"
        );
        return outSPC;
    }

    /// @notice Given a specified amount of SPC, get ETH back based on market conditions.
    /// @param inSPC Amount of SPC to deposit for the swap.
    /// @param outETHMin Minimum amount of ETH to be returned. Revert if not true.
    /// @param to Address where the ETH should be sent to.
    /// @dev User should use this function when tax is active instead of swapExactSPCforETH().
    function swapExactSPCWithTransferTaxforETH(
        uint256 inSPC,
        uint256 outETHMin,
        address to
    ) external returns (uint256 outETH) {
        require(
            spaceCoin.transferTaxActive(),
            "SpaceCoin transfer tax must be active"
        );
        uint256 userETHStart = to.balance;
        SpaceLibrary.safeTransferFromSPC(
            spaceCoin,
            msg.sender,
            address(pool),
            inSPC
        );
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        uint256 inSPCAfterTransfer = spaceCoin.balanceOf(address(pool)) -
            reserveSPC;
        outETH = _calculateReturnWithSwapFee(
            inSPCAfterTransfer,
            reserveSPC,
            reserveETH
        );
        pool.swap(outETH, 0, to);
        require(
            to.balance - userETHStart >= outETHMin,
            "Does not meet ETH minimum conditions"
        );
        return outETH;
    }

    /// @notice Used to calculate the amount of ETH and SPC that should be
    /// deposited into the pool given the parameters.
    /// @dev Does not call pools mint() function.
    function _getOptimalAmounts(
        uint256 spcDesired,
        uint256 ethMin,
        uint256 spcMin
    ) private returns (uint256 inETH, uint256 inSPC) {
        (uint256 reserveETH, uint256 reserveSPC) = pool.getReserves();
        if (reserveETH == 0 && reserveSPC == 0) {
            return (msg.value, spcDesired);
        }

        uint256 spcCurrentPrice = _quoteNoFees(
            msg.value,
            reserveETH,
            reserveSPC
        );
        if (spcCurrentPrice <= spcDesired) {
            require(spcCurrentPrice >= spcMin, "Insufficient SPC amount");
            return (msg.value, spcCurrentPrice);
        }

        uint256 ethCurrentPrice = _quoteNoFees(
            spcDesired,
            reserveSPC,
            reserveETH
        );
        require(ethCurrentPrice >= ethMin, "Insufficient ETH amount");
        return (ethCurrentPrice, spcDesired);
    }

    /// @notice Gets price of ETH or SPC based on current reserve data.
    /// @param spcOrETHAmount Amount of ETH or SPC. If ETH, mainReserve should be reserveETH.
    /// If SPC, mainReserve should be reserveSPC.
    /// @param mainReserve Primary reserve that matches `spcOrETHAmount`.
    /// @param otherReserve Secondary reserve that opposes `spcOrETHAmount`.
    /// @dev This is used for quoting both SPC and ETH.
    function _quoteNoFees(
        uint256 spcOrETHAmount,
        uint256 mainReserve,
        uint256 otherReserve
    ) private pure returns (uint256 amountB) {
        require(spcOrETHAmount > 0, "Not enough for a quote");
        require(mainReserve > 0 && otherReserve > 0, "Not enough liquidity");
        return (spcOrETHAmount * otherReserve) / mainReserve;
    }

    /// @notice Calculates the amount of tokens the protocol should return
    /// taking fees into account.
    /// @param spcOrETHAmount Amount of ETH or SPC. If ETH, inReserve should be reserveETH.
    /// If SPC, inReserve should be reserveETH.
    /// @param inReserve Primary reserve that matches `spcOrETHAmount`.
    /// @param outReserve Secondary reserve that opposes `spcOrETHAmount`.
    function _calculateReturnWithSwapFee(
        uint256 spcOrETHAmount,
        uint256 inReserve,
        uint256 outReserve
    ) private pure returns (uint256 outAmount) {
        require(spcOrETHAmount > 0, "Insufficient ETH/SPC input amount");
        require(
            inReserve > 0 && outReserve > 0,
            "Not enough liquidity to calculate return amount"
        );
        uint256 hundredPercent = 100;
        uint256 amountWithFee = spcOrETHAmount *
            (hundredPercent - SWAP_FEE_PERCENT);
        uint256 numerator = amountWithFee * outReserve;
        uint256 denominator = (inReserve * hundredPercent) + amountWithFee;
        return (numerator / denominator);
    }
}
