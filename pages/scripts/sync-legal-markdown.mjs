import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(scriptFilePath);
const pagesWorkspaceRootPath = path.resolve(scriptsDirectoryPath, "..");
const repositoryRootPath = path.resolve(pagesWorkspaceRootPath, "..");
const generatedLegalDirectoryPath = path.join(pagesWorkspaceRootPath, "src/pages/_generated/legal");

const legalMarkdownSyncTargets = [
  { sourcePath: path.join(repositoryRootPath, "PRIVACY_POLICY.md"), destinationFileName: "privacy-policy.md" },
  { sourcePath: path.join(repositoryRootPath, "TERMS_OF_SERVICE.md"), destinationFileName: "terms-of-service.md" },
];

await mkdir(generatedLegalDirectoryPath, { recursive: true });

for (const target of legalMarkdownSyncTargets) {
  const destinationPath = path.join(generatedLegalDirectoryPath, target.destinationFileName);
  await cp(target.sourcePath, destinationPath);
}
