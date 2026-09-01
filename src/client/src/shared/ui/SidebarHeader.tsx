import type { ReactNode } from "react";

export function SidebarHeader({
  title,
  subtitle,
  actions,
  prominent = false,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <header
      className={`ui-sidebar-header${prominent ? " ui-sidebar-header--prominent" : ""} ${className}`.trim()}
    >
      <div className="ui-sidebar-header__heading">
        <h2 className="ui-sidebar-header__title">{title}</h2>
        {subtitle && (
          <div className="ui-sidebar-header__subtitle">{subtitle}</div>
        )}
      </div>
      {actions && <div className="ui-sidebar-header__actions">{actions}</div>}
    </header>
  );
}
