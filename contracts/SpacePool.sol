//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./SpaceCoin.sol";
import "./SpaceLibrary.sol";

/// @notice SpaceCoin and ETH liquidity pool contract
contract SpacePool is ERC20 {
    /// Name of the LP token used by SpacePool
    string public constant NAME = "SpacePool Liquidity Token";

    /// Symbol of LP token
    string public constant SYMBOL = "SPL";

    /// Trading fee incurred on every swap.
    uint256 public constant FEE_PERCENT = 1;

    /// @notice This amount is burned upon initial deposit to prevent divide by zero,
    /// as well as a scenario in which on LP token share being too expensive,
    /// which would turn away small LPs.
    uint256 public constant MIN_LIQUIDITY = 10**3;

    /// OpenZeppelin ERC20 does not allow for zero address minting.
    /// Use this burn address instead.
    address public constant BURN_ADDRESS =
        0xBaaaaaaaAAaaAaaaaaaAaAAAaaAAaAaaAAaaAAAD;

    /// Token contract for the liquidity pool.
    SpaceCoin public immutable spaceCoin;

    /// Amount of ETH the pool has in reserve.
    uint256 private reserveETH;

    /// Amount of SPC tokens the pool has in reserve.
    uint256 private reserveSPC;

    /// Mutex used to prevent reentrancy vulnerabilities.
    bool private reentrancyLock = false;

    /// Prevents functions with this modifier from being reentrant.
    modifier nonReentrant() {
        require(!reentrancyLock, "Operation already in progress");
        reentrancyLock = true;
        _;
        reentrancyLock = false;
    }

    /// Emitted in the mint() function.
    event Mint(address indexed sender, uint256 ethAmount, uint256 spcAmount);

    /// Emitted in the burn() function.
    event Burn(
        address indexed sender,
        uint256 ethAmount,
        uint256 spcAmount,
        address indexed to
    );

    /// Emitted in the swap() function.
    event Swap(
        address indexed sender,
        uint256 ethIn,
        uint256 spcIn,
        uint256 ethOut,
        uint256 spcOut,
        address indexed to
    );

    /// Emitted in _updateReserves() which is called in swap/mint/burn/sync.
    event Sync(uint256 ethReserve, uint256 spcReserve);

    /// Constructor to set the immutable variable and ERC20 inputs.
    constructor(SpaceCoin spc) ERC20(NAME, SYMBOL) {
        spaceCoin = spc;
    }

    /// @notice Used when someone want to trade tokens.
    /// @param ethOut Amount of ETH caller expects to receive.
    /// @param spcOut Amount of SPC caller expects to receive.
    /// @param swapper Address of the swapper.
    /// @dev Router contract sends tokens before this function is called.
    function swap(
        uint256 ethOut,
        uint256 spcOut,
        address swapper
    ) external payable nonReentrant {
        require(swapper != address(0), "Invalid swapper");
        require(swapper != address(spaceCoin), "Address cannot be SPC");
        require(
            (ethOut > 0 && spcOut == 0 && msg.value == 0) ||
                (ethOut == 0 && spcOut > 0 && msg.value > 0),
            "Only single-sided swaps allowed"
        );
        (uint256 _reserveETH, uint256 _reserveSPC) = getReserves();
        require(ethOut < _reserveETH, "Not enough ETH in reserve");
        require(spcOut < _reserveSPC, "Not enough SPC in reserve");

        uint256 k;
        uint256 ethBalance = address(this).balance;
        uint256 spcBalance = spaceCoin.balanceOf(address(this));
        (uint256 ethIn, uint256 spcIn) = (0, 0);
        if (ethOut > 0) {
            // Swapping SPC for ETH
            spcIn = spcBalance - (_reserveSPC - spcOut);
            require(spcIn > 0, "Insufficient SPC input amount");
            SpaceLibrary.safeTransferETH(swapper, ethOut);
        } else {
            // Swapping ETH for SPC
            ethIn = ethBalance - (_reserveETH - ethOut);
            require(ethIn > 0, "Insufficient ETH input amount");
            SpaceLibrary.safeTransferSPC(spaceCoin, swapper, spcOut);
        }
        uint256 HUNDRED_PERCENT = 100;
        {
            ethBalance = address(this).balance;
            spcBalance = spaceCoin.balanceOf(address(this));
            uint256 x = (ethBalance * HUNDRED_PERCENT) - (ethIn * FEE_PERCENT);
            uint256 y = (spcBalance * HUNDRED_PERCENT) - (spcIn * FEE_PERCENT);
            k = x * y;
        }
        // The new k with fees calculated should never be lower than the previous k
        require(
            k >= (_reserveETH * _reserveSPC) * (HUNDRED_PERCENT**2),
            "Invalid K"
        );

        _updateReserves(ethBalance, spcBalance);
        emit Swap(msg.sender, ethIn, spcIn, ethOut, spcOut, swapper);
    }

    /// @notice Used when someone adds liquidity to the pool.
    /// @param to The account the protocol will mint new LP tokens to.
    /// @dev Assumes tokens and ETH have already been sent to this pool first.
    function mint(address to) external payable nonReentrant returns (uint256) {
        (uint256 _reserveETH, uint256 _reserveSPC) = getReserves();
        uint256 ethBalance = address(this).balance;
        uint256 spcBalance = spaceCoin.balanceOf(address(this));
        uint256 diffETH = ethBalance - _reserveETH;
        uint256 diffSPC = spcBalance - _reserveSPC;
        uint256 amountToMint;

        uint256 lpTokenSupply = totalSupply();
        bool isFirstDeposit = lpTokenSupply == 0;
        if (isFirstDeposit) {
            amountToMint = SpaceLibrary.sqrt(diffETH * diffSPC) - MIN_LIQUIDITY;
            _mint(BURN_ADDRESS, MIN_LIQUIDITY);
        } else {
            amountToMint = SpaceLibrary.min(
                (diffETH * lpTokenSupply) / _reserveETH,
                (diffSPC * lpTokenSupply) / _reserveSPC
            );
        }
        require(amountToMint > 0, "Not enough liquidity minted");

        _mint(to, amountToMint);
        _updateReserves(ethBalance, spcBalance);

        emit Mint(msg.sender, diffETH, diffSPC);
        return amountToMint;
    }

    /// @notice Used when someone removes liquidity to the pool.
    /// @param to The account the protocol will return ETH and SPC to.
    /// @dev Assumes LP token has been sent to this pool first.
    function burn(address to) external nonReentrant returns (uint256, uint256) {
        require(to != address(spaceCoin), "Address cannot be SPC");
        uint256 ethBalance = address(this).balance;
        uint256 spcBalance = spaceCoin.balanceOf(address(this));
        uint256 amountToBurn = balanceOf(address(this));

        uint256 lpTokenSupply = totalSupply();
        uint256 ethToSend = (amountToBurn * ethBalance) / lpTokenSupply;
        uint256 spcToSend = (amountToBurn * spcBalance) / lpTokenSupply;
        require(ethToSend > 0 && spcToSend > 0, "Not enough liquidity burned");

        _burn(address(this), amountToBurn);

        SpaceLibrary.safeTransferSPC(spaceCoin, to, spcToSend);
        SpaceLibrary.safeTransferETH(to, ethToSend);

        ethBalance = address(this).balance;
        spcBalance = spaceCoin.balanceOf(address(this));
        _updateReserves(ethBalance, spcBalance);
        emit Burn(msg.sender, ethToSend, spcToSend, to);
        return (ethToSend, spcToSend);
    }

    /// @notice Returns the x and y values of the pool. (Constant product formula).
    /// @dev These numbers may be out of date, which is why `_updateReserves()` is called
    /// throughout this contract.
    function getReserves()
        public
        view
        returns (uint256 ethReserve, uint256 spcReserve)
    {
        return (reserveETH, reserveSPC);
    }

    /// @notice Used to update the `reserveETH` and `reserveSPC` values with given inputs.
    /// @param ethBalance new value to update `reserveETH` with.
    /// @param spcBalance new value to update `reserveSPC` with.
    function _updateReserves(uint256 ethBalance, uint256 spcBalance) private {
        reserveETH = ethBalance;
        reserveSPC = spcBalance;
        emit Sync(reserveETH, reserveSPC);
    }
}
