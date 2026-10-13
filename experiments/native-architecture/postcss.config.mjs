import reactStrictPlugin from 'react-strict-dom/postcss-plugin';

export default {
  plugins: [
    reactStrictPlugin({
      cwd: import.meta.dirname,
      include: ['src/**/*.{ts,tsx}'],
      // Android and iOS files theme from runtime values that the static web compile rejects.
      exclude: ['src/**/*.native.{ts,tsx}'],
    }),
  ],
};
