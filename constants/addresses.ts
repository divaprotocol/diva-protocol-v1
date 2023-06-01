// DIVA Protocol V1 contract addresses by network.
// Used in example scripts only.
export const DIVA_ADDRESS = {
  ethMain: "",
  polygon: "0x60f5A0c12457761558f5d9933f5924fE8907eBcf",
  gnosis: "",
  arbitrumMainnet: "", // Arbitrum One
  goerli: "0xa6E26dbA7aA0d065b3C866Bb61B4AeF3Bb9d4874",
  sepolia: "0xF554e0FE7F75BaA00d76c4347fc098C9F88D2D25",
  mumbai: "0xa761003C34936b760473eD993B2B6208aB07782E",
  chiado: "0x05029c04AFB6cf53Ef0af7af7e970E53A7143bD3",
  arbitrumTestnet: "0x93640bd8fEa53919A102ad2EEA4c503E640eDDAd",
};

// Used in `stake.ts` example script only
export const OWNERSHIP_ADDRESS = {
  ethMain: "",
  goerli: "",
};

// Used in `stake.ts` example script only
export const DIVA_TOKEN_ADDRESS = {
  ethMain: "",
  goerli: "",
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
  ethMain: "0xB3B662644F8d3138df63D2F43068ea621e2981f9",
  polygon: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  gnosis: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  arbitrumMainnet: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0", // Arbitrum One
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
  arbitrumMainnet: "", // Arbitrum One
  goerli: "0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e",
  mumbai: "",
  chiado: "",
  sepolia: "",
  arbitrumTestnet: "",
} as {
  [key: string]: string;
};
