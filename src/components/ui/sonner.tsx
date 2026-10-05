import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !border-border !text-foreground !rounded-lg !font-sans",
          description: "!text-muted-foreground",
          error: "!text-destructive",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
