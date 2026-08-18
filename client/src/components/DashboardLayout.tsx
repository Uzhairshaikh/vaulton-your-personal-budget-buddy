import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Archive, Bell, ChartNoAxesCombined, FileText, LayoutDashboard, LogOut, PanelLeft, ShieldCheck } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: Archive, label: "Purchases", path: "/purchases" },
  { icon: ShieldCheck, label: "Warranties", path: "/warranties" },
  { icon: Bell, label: "Return deadlines", path: "/returns" },
  { icon: ChartNoAxesCombined, label: "Spending insights", path: "/insights" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => { const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY); return saved ? parseInt(saved, 10) : DEFAULT_WIDTH; });
  const { loading, user } = useAuth();
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()); }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="min-h-screen bg-[#f5f1e9] flex items-center justify-center p-6"><div className="w-full max-w-md rounded-[28px] bg-[#fffdf8] p-10 text-center shadow-[0_25px_80px_rgba(23,48,68,.12)]"><div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#173044] text-[#fffdf8]"><FileText className="h-6 w-6" /></div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[#d86f62]">Receiptwise</p><h1 className="display-font text-4xl text-[#173044]">Your purchases, finally in one place.</h1><p className="mt-4 text-sm leading-6 text-[#72808b]">Sign in to save receipts, track deadlines, and make every warranty count.</p><Button onClick={() => startLogin()} className="btn-press mt-8 h-12 w-full rounded-xl bg-[#d86f62] text-white hover:bg-[#c96054]">Sign in to continue</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

type DashboardLayoutContentProps = { children: React.ReactNode; setSidebarWidth: (width: number) => void };

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location) ?? menuItems[0];
  const isMobile = useIsMobile();
  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const move = (event: MouseEvent) => { if (!isResizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = event.clientX - left; if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width); };
    const up = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
  }, [isResizing, setSidebarWidth]);
  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#173044]" disableTransition={isResizing}>
        <SidebarHeader className="h-20 justify-center border-b border-[#2d4b5e]">
          <div className="flex w-full items-center gap-3 px-2"><button onClick={toggleSidebar} aria-label="Toggle navigation" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#b4c2c4] transition-colors hover:bg-[#27465a] hover:text-white"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="min-w-0"><p className="display-font text-[26px] leading-none text-[#fffdf8]">Receiptwise</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.19em] text-[#a8c2b6]">purchase command center</p></div>}</div>
        </SidebarHeader>
        <SidebarContent className="gap-0 px-2 py-5"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#77909d] group-data-[collapsible=icon]:hidden">Workspace</p><SidebarMenu>{menuItems.map(item => { const isActive = location === item.path; return <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={isActive} onClick={() => setLocation(item.path)} tooltip={item.label} className={`mb-1 h-11 rounded-xl font-medium transition-all ${isActive ? "bg-[#fffdf8] text-[#173044] hover:bg-[#fffdf8]" : "text-[#c9d5d4] hover:bg-[#27465a] hover:text-white"}`}><item.icon className={`h-[17px] w-[17px] ${isActive ? "text-[#d86f62]" : ""}`} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></SidebarContent>
        <SidebarFooter className="border-t border-[#2d4b5e] p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-[#27465a] group-data-[collapsible=icon]:justify-center"><Avatar className="h-9 w-9 shrink-0 border-2 border-[#52707c]"><AvatarFallback className="bg-[#d86f62] text-xs font-bold text-white">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium leading-none text-white">{user?.name || "Member"}</p><p className="mt-1.5 truncate text-xs text-[#91a8ad]">{user?.email || "Personal workspace"}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter>
      </Sidebar><div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-[#d86f62]/40 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => !isCollapsed && setIsResizing(true)} />
    </div>
    <SidebarInset className="bg-[#f5f1e9]">{isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[#e5dfd4] bg-[#f5f1e9]/95 px-3 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg bg-[#fffdf8]" /><span className="display-font text-2xl text-[#173044]">{activeMenuItem.label}</span></div>}<main className="min-h-screen flex-1 p-3 sm:p-5 lg:p-8">{children}</main></SidebarInset>
  </>;
}
