"use client";
import {
  Archive, ArrowLeft, BadgeCheck, Bell, BellRing, BookOpen, Building2, CalendarDays, CalendarRange,
  Camera, ChartNoAxesColumnIncreasing, ChartSpline, CheckSquare, ChevronDown, CircleAlert, ClipboardCheck,
  Cog, FileInput, FileText, FolderArchive, FolderCheck, Footprints, Gauge, Inbox, KeyRound, LayoutDashboard,
  Lightbulb, ListChecks, LogOut, Megaphone, Menu, MessageCircleWarning, Network, PanelLeftClose, PanelLeftOpen,
  Paperclip, Pencil, PieChart, Plus, RefreshCw, Save, Search, SearchCheck, Send, Settings, ShieldAlert, ShieldCheck,
  Sparkles, Sprout, Target, TrendingUp, TriangleAlert, Users, UsersRound, Workflow, X
} from "lucide-react";

const map:Record<string,React.ComponentType<{size?:number;className?:string}>>={
  "layout-dashboard":LayoutDashboard,"pie-chart":PieChart,"check-square":CheckSquare,"inbox":Inbox,
  "calendar-range":CalendarRange,"file-input":FileInput,"send":Send,"calendar-days":CalendarDays,
  "clipboard-search":Search,"clipboard-check":ClipboardCheck,"chart-no-axes-column-increasing":ChartNoAxesColumnIncreasing,
  "list-checks":ListChecks,"circle-alert":CircleAlert,"shield-alert":ShieldAlert,"workflow":Workflow,
  "triangle-alert":TriangleAlert,"lightbulb":Lightbulb,"badge-check":BadgeCheck,"folder-check":FolderCheck,
  "folder-archive":FolderArchive,"search-check":SearchCheck,"chart-spline":ChartSpline,"trending-up":TrendingUp,
  "megaphone":Megaphone,"message-circle-warning":MessageCircleWarning,"users":Users,"users-round":UsersRound,
  "building-2":Building2,"key-round":KeyRound,"settings":Settings,"menu":Menu,"x":X,"bell":Bell,
  "bell-ring":BellRing,"logout":LogOut,"chevron-down":ChevronDown,"search":Search,"plus":Plus,
  "pencil":Pencil,"file-text":FileText,"save":Save,"shield-check":ShieldCheck,"camera":Camera,
  "paperclip":Paperclip,"panel-left-close":PanelLeftClose,"panel-left-open":PanelLeftOpen,"arrow-left":ArrowLeft,
  "archive":Archive,"sparkles":Sparkles,"target":Target,"gauge":Gauge,"network":Network,"footprints":Footprints,
  "book-open":BookOpen,"cog":Cog,"refresh-cw":RefreshCw,"sprout":Sprout
};

export function Icon({name,size=18,className}:{name:string;size?:number;className?:string}){
  const C=map[name]||FileText;
  return <C size={size} className={className}/>;
}
