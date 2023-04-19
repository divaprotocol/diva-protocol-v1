import fs from "fs";
import { task } from "hardhat/config";

const basePath = "/contracts/facets/";
const libraryBasePath = "/contracts/libraries/";

task(
  "diamondABI",
  "Generates ABI file for diamond, includes all ABIs of facets"
).setAction(async () => {
  let files = fs.readdirSync("." + basePath);
  const abi: any[] = [];
  const abiExclDuplicates: any[] = [];
  for (const file of files) {
    const jsonFile = file.replace("sol", "json");
    const json = fs.readFileSync(`./artifacts/${basePath}${file}/${jsonFile}`);
    abi.push(...JSON.parse(json.toString()).abi);
  }
  files = fs.readdirSync("." + libraryBasePath);
  for (const file of files) {
    const jsonFile = file.replace("sol", "json");
    const json = fs.readFileSync(
      `./artifacts/${libraryBasePath}${file}/${jsonFile}`
    );
    abi.push(...JSON.parse(json.toString()).abi);
  }
  // Exclude duplicates (identifier: name + type; careful with overloaded functions)
  abi.forEach((v) => {
    const ids = abiExclDuplicates.map((a) => a.name + a.type);
    if (!ids.includes(v.name + v.type)) {
      abiExclDuplicates.push(v);
    }
  });

  const finalAbi = JSON.stringify(abiExclDuplicates);
  fs.writeFileSync("./diamondABI/diamond.json", finalAbi);
  console.log("ABI written to diamondABI/diamond.json");
});
