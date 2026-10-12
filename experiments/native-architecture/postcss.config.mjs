import reactStrictPlugin from 'react-strict-dom/postcss-plugin';

export default {
  plugins: [
    reactStrictPlugin({
      cwd: import.meta.dirname,
      include: ['src/**/*.{ts,tsx}'],
    }),
  ],
};
