"use client";

import Image from "next/image";
import Link from "next/link";

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
  return (
    <Link href={href} className={className} aria-label="SMSHub home">
      <Image
        src="/logo.svg"
        alt="SMSHub"
        width={280}
        height={80}
        priority={priority}
        className={imageClassName}
      />
    </Link>
  );
}
