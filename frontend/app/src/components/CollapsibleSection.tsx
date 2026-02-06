import { useState, type ReactNode } from "react";
import cn from "classnames";

import "./CollapsibleSection.scss";

type CollapsibleSectionProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

export default function CollapsibleSection({
  title,
  children,
  className,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <section
      className={cn("collapsible-section", className, {
        "is-collapsed": !isOpen,
      })}
    >
      <button
        type="button"
        className="collapsible-toggle"
        onClick={toggle}
        aria-expanded={isOpen}
      >
        <span className="collapsible-title">{title}</span>
        <span className="collapsible-icon" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
      <div className="collapsible-body" hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}
