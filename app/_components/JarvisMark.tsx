import Image from "next/image";
import jarvisIcon from "@/app/icon.png";
import { cn } from "@/app/_lib/cn";

export default function JarvisMark({
  className,
  alt = "JARVIS",
  priority = false,
  sizes = "160px",
}: {
  className?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image
        src={jarvisIcon}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover"
      />
    </span>
  );
}
