"use client";

import Image from "next/image";
import Link from "next/link";

type LogoProps = {
  href?: string;
  textClassName?: string;
  imageClassName?: string;
  className?: string;
  priority?: boolean;
};

export function Logo({
  href = "/",
  textClassName = "text-xl font-bold",
  imageClassName = "h-8 w-auto",
  className = "flex items-center gap-3",
  priority = false,
}: LogoProps) {
  return (
    <Link href={href} className={className} aria-label="SMSHub home">
      <Image
        src="/logo.svg"
        alt="SMSHub"
        width={140}
        height={40}
        priority={priority}
        className={imageClassName}
      />
      <span className={textClassName}>SMSHub</span>
    </Link>
  );
}
