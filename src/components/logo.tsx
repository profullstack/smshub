"use client";

import Image from "next/image";
import Link from "next/link";
import { useBrand } from "@/contexts/brand-context";
import { StationLogo } from "@/components/station/station-logo";

type LogoProps = {
  href?: string;
  imageClassName?: string;
  className?: string;
  priority?: boolean;
};

export function Logo({
  href = "/",
  imageClassName = "h-16 w-auto",
  className = "flex items-center gap-3",
  priority = false,
}: LogoProps) {
  const brand = useBrand();
  if (brand.id === "numberstation") return <StationLogo href={href} />;

  return (
    <Link href={href} className={className} aria-label={`${brand.name} home`}>
      <Image
        src={brand.logo}
        alt={brand.name}
        width={280}
        height={80}
        priority={priority}
        className={imageClassName}
      />
    </Link>
  );
}
