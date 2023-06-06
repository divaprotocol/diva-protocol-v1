// DIVA Protocol V1 contract addresses by network.
// Used in example scripts only.
export const DIVA_ADDRESS = {
  ethMain: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  polygon: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  gnosis: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  arbitrumMain: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D", // Arbitrum One
  goerli: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  sepolia: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  mumbai: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  chiado: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  arbitrumTestnet: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
};

// Ownership contract address on primary chain. Used in `stake.ts` example script only
export const OWNERSHIP_ADDRESS = {
  ethMain: "0xE39dEC81B2186A1A2e36bFC260F3Df444b36948A",
  sepolia: "0xE39dEC81B2186A1A2e36bFC260F3Df444b36948A",
};

// Used in `stake.ts` example script only
export const DIVA_TOKEN_ADDRESS = {
  ethMain: "0x4B7fFCB2b92fB4890f22f62a52Fb7A180eaB818e",
  sepolia: "0x4B7fFCB2b92fB4890f22f62a52Fb7A180eaB818e",
};

// Used in example scripts only (e.g., `createContingentPool.ts`)
export const COLLATERAL_TOKENS = {
  goerli: {
    dUSD: "0xFA158C9B780A4213f3201Ae74Cca013712c8538d",
  },
  sepolia: {
    dUSD: "0xf0172F664195e3b91C3B8600476C58de48366a61",
  },
  mumbai: {
    dUSD: "0xf5d5Ea0a5E86C543bEC01a9e4f513525365a86fD",
  },
  chiado: {
    dUSD: "0x524eF4F6225365470E6da2BEA59aF5dFdd9C8108",
  },
  arbitrumTestnet: {
    dUSD: "0x7F8c827150FeA992132Ad44Fe3EB58A9A5270490",
  },
};

// Tellor contract INCLUDING the requirement to stake prior to reporting.
// Used for DIVA Protocol secondary version deployment.
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_ADDRESS = {
  ethMain: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  polygon: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  gnosis: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  arbitrumMain: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0", // Arbitrum One
  goerli: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  sepolia: "0x199839a4907ABeC8240D119B606C98c405Bb0B33",
  mumbai: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  chiado: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  arbitrumTestnet: "0xb2CB696fE5244fB9004877e58dcB680cB86Ba444",
} as {
  [key: string]: string;
};

// Tellor playground contract EXCLUDING the requirement to stake prior to reporting.
// Used for tests only.
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_PLAYGROUND_ADDRESS = {
  goerli: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  sepolia: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  mumbai: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  chiado: "0xe7147C5Ed14F545B4B17251992D1DB2bdfa26B6d",
  arbitrumTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
};

// Used in example scripts only
export const MULTICALL_ADDRESS = {
  ethMain: "",
  polygon: "",
  gnosis: "",
  arbitrumMain: "", // Arbitrum One
  goerli: "0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e",
  mumbai: "",
  chiado: "",
  sepolia: "",
  arbitrumTestnet: "",
} as {
  [key: string]: string;
};
