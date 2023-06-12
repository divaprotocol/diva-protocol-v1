import fs from "fs";
import util from "util";
import child_process from "child_process";

const exec = util.promisify(child_process.exec);

export const writeFile = (fileName: string, content: string) => {
  fs.writeFile(fileName, content, "utf8", (err) => {
    if (err) throw err;
    console.log(`The following has been saved: ${fileName}`);
  });
};

// Auxiliary function to execute command line commands from within the script.
export const execCommand = async (command: string) => {
  try {
    const { stdout, stderr } = await exec(command);
    if (stderr && !stderr.toLowerCase().includes("warning")) {
      console.error("stderr:", stderr);
      throw new Error(stderr);
    }
    console.log(stdout);
    return stdout;
  } catch (e) {
    console.error(e);
    return false;
  }
};
