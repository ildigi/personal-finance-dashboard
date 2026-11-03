import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

import { useNavBadges, type NavBadge } from "@/app/nav-badges";
import { NAV_GROUPS, navLabel, SETTINGS_ITEM, type NavItem } from "@/app/navigation";
import { BrandMark } from "@/components/common/BrandMark";
import { cn } from "@/lib/utils";

import { BackendStatus } from "./BackendStatus";
import { NavBadgePill } from "./NavBadgePill";

function SidebarLink({ item, badge }: { item: NavItem; badge?: NavBadge }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-card"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-colors",
              isActive
                ? "text-sidebar-primary"
                : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate">{navLabel(item)}</span>
          {badge && <NavBadgePill badge={badge} />}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const badges = useNavBadges();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <BrandMark />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("common.appName")}
          </div>
          <div className="text-xs text-muted-foreground">{t("common.appTagline")}</div>
        </div>
      </div>

      <nav aria-label={t("nav.main")} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.id ?? index} className={cn(index > 0 && "mt-6")}>
              {group.id && (
                <div className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
                  {t(`nav.groups.${group.id}`)}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <SidebarLink item={item} badge={badges.get(item.path)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-sidebar-border px-3 pt-3">
          <SidebarLink item={SETTINGS_ITEM} />
        </div>
      </nav>

      <div className="p-3">
        <BackendStatus />
      </div>
    </aside>
  );
}
