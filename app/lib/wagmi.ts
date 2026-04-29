import { http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

export const config = getDefaultConfig({
  appName: 'VEIL Finance',
  projectId: 'd6c397fa7c24d7f34c3b21495e27436e',
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
});
