import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.cjs.js",
      format: "cjs", // CommonJS形式（Nodeなど）
    },
    {
      file: "dist/index.esm.js",
      format: "esm", // ESモジュール形式（モダンブラウザ・webpackなど）
    },
    {
      file: "dist/index.umd.js",
      format: "umd", // Universal Module Definition（直接ブラウザでも使える）
      name: "Magnetic",
    },
  ],
  plugins: [
    typescript(), // tsconfig.jsonが使われる
    terser(), // 最小化
  ],
};
