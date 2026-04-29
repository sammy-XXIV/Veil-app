export const VEIL_ADDRESS = '0x1689b2e699bD28Dc21A8442Ec8e3D39F5d52dDCB';
export const CWETH_ADDRESS = '0x46208622DA27d91db4f0393733C8BA082ed83158';
export const CWETH_DECIMALS = 8;

export const VEIL_ABI = [
  'function openPosition(bytes32 encryptedAmount, bytes calldata inputProof, uint256 plainAmount) external',
  'function addCollateral(bytes32 encryptedAmount, bytes calldata inputProof, uint256 plainAmount) external',
  'function borrow(bytes32 encryptedAmount, bytes calldata inputProof, uint256 plainAmount) external',
  'function repay(bytes32 encryptedAmount, bytes calldata inputProof, uint256 plainAmount) external',
  'function closePosition() external',
  'function hasPosition(address) external view returns (bool)',
  'function getPositionMeta(address) external view returns (bool exists, uint256 openedAt, uint256 collateralPlain, uint256 debtPlain)',
  'function getStats() external view returns (uint256 positions, uint256 pool)',
] as const;

export const CWETH_ABI = [
  'function confidentialBalanceOf(address) external view returns (bytes32)',
  'function isOperator(address account, address operator) external view returns (bool)',
  'function setOperator(address operator, uint48 until) external',
] as const;
