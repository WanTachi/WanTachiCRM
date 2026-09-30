export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "WanTachi",
  logoPath: process.env.NEXT_PUBLIC_BRAND_LOGO || null,
  faviconPath: process.env.NEXT_PUBLIC_BRAND_FAVICON || null,
  primaryColor: "#d39858",
  secondaryColor: "#344c43",
  theme: "system" as const,
};

export type BrandConfig = typeof brand;
