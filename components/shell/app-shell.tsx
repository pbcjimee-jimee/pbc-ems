"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { Role } from "@/lib/domain/types";
import { initials } from "@/components/ui/avatar";
import { Icon, type IconName } from "./icons";
import styles from "./shell.module.css";

type NavItem = { label: string; href: string; icon: IconName; admin?: boolean };
const navigation: NavItem[][] = [
  [
    { label: "Home", href: "/home", icon: "home" },
    { label: "Schedule", href: "/schedule", icon: "schedule" },
  ],
  [
    { label: "Clients", href: "/clients", icon: "clients" },
    { label: "Requests", href: "/requests", icon: "requests" },
    { label: "Quotes", href: "/quotes", icon: "quotes", admin: true },
    { label: "Jobs", href: "/jobs", icon: "jobs" },
    { label: "Invoices", href: "/invoices", icon: "invoices", admin: true },
  ],
  [
    { label: "Expenses", href: "/expenses", icon: "expenses" },
    { label: "Timesheets", href: "/timesheets", icon: "timesheets" },
  ],
];
const creations: { label: string; href: string; detail: string; icon: IconName }[] = [
  { label: "Client", href: "/clients/new", detail: "Contact and work sites", icon: "clients" },
  { label: "Request", href: "/requests/new", detail: "New enquiry or site inspection", icon: "requests" },
  { label: "Quote", href: "/quotes/new", detail: "PBC calculator and customer quote", icon: "quotes" },
  { label: "Job", href: "/jobs/new", detail: "Confirmed work and visits", icon: "jobs" },
  { label: "Invoice", href: "/invoices/new", detail: "Bill completed work", icon: "invoices" },
];
const mobileTabs: NavItem[] = [
  { label: "Home", href: "/home", icon: "home" },
  { label: "Schedule", href: "/schedule", icon: "schedule" },
  { label: "Jobs", href: "/jobs", icon: "jobs" },
  { label: "Time", href: "/timesheets", icon: "timesheets" },
];

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

export function AppShell({ children, role, userName, companyName, signOut }: {
  children: ReactNode; role: Role; userName: string; companyName: string; signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const create = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const admin = role === "admin";
  const groups = navigation.map(group => group.filter(item => !item.admin || admin)).filter(group => group.length);
  const current = groups.flat().find(item => isCurrent(pathname, item.href));
  const title = current?.label ?? (pathname.startsWith("/settings") ? "Company details" : pathname.startsWith("/search") ? "Search" : "Workspace");

  useEffect(() => {
    // "/" focuses global search unless the person is already typing somewhere.
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      if (search.current && search.current.offsetParent !== null) search.current.focus(); else router.push("/search");
    }
    function onPointer(event: PointerEvent) {
      if (create.current?.open && event.target instanceof Node && !create.current.contains(event.target)) create.current.open = false;
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [router]);

  function closeNavigation() { dialog.current?.close(); if (create.current) create.current.open = false; }

  const links = <nav aria-label="Main navigation" className={styles.navigation}>
    {groups.map((group, index) => <div key={index} className={styles.navGroup}>{group.map(item =>
      <Link key={item.href} href={item.href} onClick={closeNavigation} aria-current={isCurrent(pathname, item.href) ? "page" : undefined} className={styles.navLink}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </Link>)}</div>)}
  </nav>;
  const brand = <Link href="/home" className={styles.brand} onClick={closeNavigation} aria-label={companyName + " home"}><span className={styles.mark}>PBC</span><span><strong>Paint Buddy &amp; Co.</strong><small>Company workspace</small></span></Link>;
  const account = <div className={styles.accountCard}>
    <span className={styles.avatar} aria-hidden="true">{initials(userName)}</span>
    <span className={styles.accountText}><strong>{userName}</strong><small>{admin ? "Administrator" : "Field supervisor"}</small></span>
    <form action={signOut}><button className={styles.iconButton} aria-label="Sign out" title="Sign out"><Icon name="logout" size={18} /></button></form>
  </div>;

  return <div className={styles.frame}>
    <a href="#main-content" className={styles.skip}>Skip to content</a>
    <aside className={styles.sidebar} data-shell-chrome>
      {brand}
      {admin && <details ref={create} className={styles.create} onKeyDown={event => { if (event.key === "Escape" && create.current?.open) { event.preventDefault(); create.current.open = false; create.current.querySelector("summary")?.focus(); } }}>
        <summary><Icon name="plus" size={18} />Create</summary>
        <div className={styles.createMenu}>
          <p>Create new</p>
          {creations.map(item => <Link key={item.href} href={item.href} onClick={closeNavigation}><span className={styles.createIcon}><Icon name={item.icon} size={18} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span></Link>)}
        </div>
      </details>}
      {links}
      <div className={styles.sidebarFoot}>
        {admin && <Link href="/settings" className={styles.navLink} aria-current={isCurrent(pathname, "/settings") ? "page" : undefined}><Icon name="settings" /><span>Company details</span></Link>}
        {account}
      </div>
    </aside>
    <div className={styles.workspace} data-shell-workspace>
      <header className={styles.header} data-shell-chrome>
        <button className={`${styles.iconButton} ${styles.mobileToggle}`} aria-label="Open navigation" onClick={() => dialog.current?.showModal()}><Icon name="menu" /></button>
        <div className={styles.context}><span className={styles.contextMark} aria-hidden="true">PBC</span>{title}</div>
        <form action="/search" className={styles.search} role="search">
          <Icon name="search" size={18} />
          <input ref={search} type="search" name="q" aria-label="Search clients and work" placeholder="Search clients, jobs, quotes…" minLength={2} />
          <kbd aria-hidden="true">/</kbd>
        </form>
        <Link href="/search" className={`${styles.iconButton} ${styles.mobileSearch}`} aria-label="Search clients and work"><Icon name="search" size={20} /></Link>
      </header>
      <main id="main-content" className={styles.main}>{children}</main>
      <footer className={styles.footer} data-shell-chrome><span>Paint Buddy &amp; Co.</span><span>All amounts in AUD · Australia/Sydney time</span></footer>
    </div>
    <nav className={styles.tabBar} aria-label="Quick navigation" data-shell-chrome>
      {mobileTabs.map(item => <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}><Icon name={item.icon} size={22} /><span>{item.label}</span></Link>)}
      <button type="button" onClick={() => dialog.current?.showModal()} aria-label="Open full menu"><Icon name="menu" size={22} /><span>More</span></button>
    </nav>
    <dialog ref={dialog} className={styles.mobileDialog} aria-label="Workspace navigation" onClick={event => { if (event.target === dialog.current) closeNavigation(); }}>
      <div className={styles.mobileHeading}>{brand}<button className={styles.iconButton} onClick={closeNavigation} aria-label="Close navigation"><Icon name="close" /></button></div>
      {admin && <div className={styles.mobileCreate}><p>Create new</p><div>{creations.map(item => <Link href={item.href} key={item.href} onClick={closeNavigation}><Icon name={item.icon} size={18} />{item.label}</Link>)}</div></div>}
      {links}
      {admin && <Link href="/settings" onClick={closeNavigation} className={styles.navLink}><Icon name="settings" /><span>Company details</span></Link>}
      <div className={styles.mobileAccount}>{account}</div>
    </dialog>
  </div>;
}
