import { main } from "./cli";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: Error) => {
    process.stderr.write(`wave-test: ${e.message}\n`);
    process.exit(2);
  },
);
