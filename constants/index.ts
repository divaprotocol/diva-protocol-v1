export * from "./eip712Types";
export * from "./types";
export * from "./addresses";
export * from "./deploy";
export * from "./pool";

export const EIP712API_URL = {
  goerli: "https://goerli.eip712api.xyz/diva/offer/v1",
  mumbai: "https://mumbai.eip712api.xyz/diva/offer/v1",
  polygon: "https://polygon.eip712api.xyz/diva/offer/v1",
} as {
  [key: string]: string;
};
