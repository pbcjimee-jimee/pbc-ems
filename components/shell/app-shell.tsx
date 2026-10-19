"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import type { Role } from "@/lib/domain/types";
import { Icon, type IconName } from "./icons";
import styles from "./shell.module.css";

const navigation: { label: string; href: string; icon: IconName; admin?: boolean }[] = [
  { label: "Home", href: "/home", icon: "home" },
  { label: "Schedule", href: "/schedule", icon: "schedule" },
  { label: "Clients", href: "/clients", icon: "clients" },
  { label: "Requests", href: "/requests", icon: "requests" },
  { label: "Quotes", href: "/quotes", icon: "quotes", admin: true },
  { label: "Jobs", href: "/jobs", icon: "jobs" },
  { label: "Invoices", href: "/invoices", icon: "invoices", admin: true },
  { label: "Expenses", href: "/expenses", icon: "expenses" },
  { label: "Timesheets", href: "/timesheets", icon: "timesheets" },
];
const creations = [
  { label: "Client", href: "/clients/new", detail: "Contact and property" },
  { label: "Request", href: "/requests/new", detail: "A new enquiry or site inspection" },
  { label: "Quote", href: "/quotes/new", detail: "PBC calculator and customer quote" },
  { label: "Job", href: "/jobs/new", detail: "Work scope and visits" },
  { label: "Invoice", href: "/invoices/new", detail: "Customer billing" },
];

export function AppShell({ children, role, userName, companyName, signOut }: {
  children: ReactNode; role: Role; userName: string; companyName: string; signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const create = useRef<HTMLDetailsElement>(null);
  const title = navigation.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))?.label ?? "Workspace";
  function closeNavigation() { dialog.current?.close(); if (create.current) create.current.open = false; }
  const links = <nav aria-label="Main navigation" className={styles.navigation}>{navigation.filter(item => !item.admin || role === "admin").map(item =>
    <Link key={item.href} href={item.href} onClick={closeNavigation} aria-current={pathname === item.href || pathname.startsWith(item.href + "/") ? "page" : undefined} className={styles.navLink}>
      <Icon name={item.icon} /><span>{item.label}</span>
    </Link>)}</nav>;
  const brand = <Link href="/home" className={styles.brand} onClick={closeNavigation} aria-label={companyName + " home"}><span className={styles.mark}>PBC</span><span><strong>Paint Buddy &amp; Co.</strong><small>Company workspace</small></span></Link>;
  return <div className={styles.frame}>
    <a href="#main-content" className={styles.skip}>Skip to content</a>
    <aside className={styles.sidebar} data-shell-chrome>
      {brand}
      {role === "admin" && <details ref={create} className={styles.create} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(create.current){create.current.open=false;create.current.querySelector('summary')?.focus();}}}}>
        <summary><Icon name="plus" />Create</summary>
        <div className={styles.createMenu}><p>Create new</p>{creations.map(item => <Link key={item.href} href={item.href} onClick={closeNavigation}><strong>{item.label}</strong><small>{item.detail}</small></Link>)}</div>
      </details>}
      {links}
      <div className={styles.sidebarFoot}>{role==='admin'&&<Link href="/settings">Company details</Link>}<small>Australia / Sydney</small><small>Paint Buddy &amp; Co. EMS</small></div>
    </aside>
    <div className={styles.workspace} data-shell-workspace>
      <header className={styles.header} data-shell-chrome>
        <button className={styles.mobileToggle} aria-label="Open navigation" onClick={() => dialog.current?.showModal()}><Icon name="menu" /></button>
        <div className={styles.context}>{title}<span>Workspace</span></div>
        <form action="/search" className={styles.search} role="search"><Icon name="search" size={18} /><input type="search" name="q" aria-label="Search clients and work" placeholder="Search clients and work..." minLength={2} /></form>
        <Link href="/search" className={styles.mobileSearch} aria-label="Search clients and work"><Icon name="search" size={19} /></Link>
        <div className={styles.account}><span className={styles.avatar} aria-hidden="true">{userName.trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase()}</span><span><strong>{userName}</strong><small>{role === "admin" ? "Administrator" : "Field supervisor"}</small></span></div>
        <form action={signOut}><button className={styles.signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={18} /></button></form>
      </header>
      <main id="main-content" className={styles.main}>{children}</main>
      <footer className={styles.footer} data-shell-chrome><span>Paint Buddy &amp; Co.</span><span>All amounts in AUD · Sydney time</span></footer>
    </div>
    <dialog ref={dialog} className={styles.mobileDialog} aria-label="Workspace navigation">
      <div className={styles.mobileHeading}>{brand}<button className={styles.signOut} onClick={closeNavigation} aria-label="Close navigation"><Icon name="close" /></button></div>
      {role === "admin" && <div className={styles.mobileCreate}>{creations.map(item => <Link href={item.href} key={item.href} onClick={closeNavigation}><Icon name="plus" size={16} />New {item.label}</Link>)}</div>}
      {links}
      {role==='admin'&&<Link href="/settings" onClick={closeNavigation} className={styles.navLink}>Company details</Link>}
    </dialog>
  </div>;
}

