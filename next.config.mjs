/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin はサーバー専用。webpackでバンドルすると動的requireが壊れるため外部化する。
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
