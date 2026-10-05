import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-6", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-10 w-fit items-center gap-1 rounded-lg bg-muted/70 p-1 shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.3)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
