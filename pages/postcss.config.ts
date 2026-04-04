import autoprefixer from "autoprefixer";
import postcssClamp from "postcss-clamp";
import postcssCustomMedia from "postcss-custom-media";
import postcssPresetEnv from "postcss-preset-env";
import postcssNesting from "postcss-nesting";
import postcssGlobalData from "@csstools/postcss-global-data";

export default {
  plugins: [
    postcssPresetEnv,
    autoprefixer,
    postcssGlobalData({
      files: ["./src/styles/variables.css"],
    }),
    postcssCustomMedia({ preserve: false }),
    postcssClamp,
    postcssNesting,
  ],
};
