import {
  Bus,
  CircleHelp,
  Coffee,
  Dumbbell,
  Gamepad,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  type LucideIcon,
  PartyPopper,
  Pencil,
  Plane,
  Repeat,
  Scissors,
  Shapes,
  Shirt,
  ShoppingCart,
  Tags,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Icone delle categorie per nome lucide (campo `icon` del seed). Mappa esplicita:
 * importare l'intero set di icone appesantirebbe il bundle di centinaia di kB.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  shirt: Shirt,
  gift: Gift,
  "shopping-cart": ShoppingCart,
  repeat: Repeat,
  "party-popper": PartyPopper,
  plane: Plane,
  bus: Bus,
  scissors: Scissors,
  "graduation-cap": GraduationCap,
  coffee: Coffee,
  house: House,
  "trending-up": TrendingUp,
  "circle-help": CircleHelp,
  shapes: Shapes,
  utensils: Utensils,
  "heart-pulse": HeartPulse,
  pencil: Pencil,
  gamepad: Gamepad,
  users: Users,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name ? CATEGORY_ICONS[name] : undefined) ?? Tags;
  return <Icon aria-hidden className={cn("size-4", className)} />;
}
