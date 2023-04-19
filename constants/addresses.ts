// DIVA contract addresses by network (as of 26 Feb 2023)
export const DIVA_ADDRESS = {
  polygon: "0x60f5A0c12457761558f5d9933f5924fE8907eBcf",
  mumbai: "0xa761003C34936b760473eD993B2B6208aB07782E",
  goerli: "0xa6E26dbA7aA0d065b3C866Bb61B4AeF3Bb9d4874",
  sepolia: "0xF554e0FE7F75BaA00d76c4347fc098C9F88D2D25",
  apothem: "0x93640bd8fEa53919A102ad2EEA4c503E640eDDAd",
};

export const OWNERSHIP_ADDRESS = {
  goerli: "",
};

export const DIVA_TOKEN_ADDRESS = {
  goerli: "",
};

export const COLLATERAL_TOKENS = {
  goerli: {
    dUSD: "0xFA158C9B780A4213f3201Ae74Cca013712c8538d",
  },
};

// Tellor contract INCLUDING the requirement to stake prior to reporting
export const TELLOR_ADDRESS = {
  ethMain: "0xB3B662644F8d3138df63D2F43068ea621e2981f9",
  polygon: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  gnosis: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  goerli: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  mumbai: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  chiado: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
} as {
  [key: string]: string;
};

// Tellor playground contract EXCLUDING the requirement to stake prior to reporting
export const TELLOR_PLAYGROUND_ADDRESS = {
  goerli: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  sepolia: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  mumbai: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  arbitrumTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  optimismTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
};

export const MULTICALL_ADDRESS = {
  goerli: "0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e",
} as {
  [key: string]: string;
};
