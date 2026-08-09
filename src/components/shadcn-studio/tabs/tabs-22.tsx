/**
 * Studio tabs-22 demo — vertical tabs with icons.
 * Adapted for Vite: lucide-react + `@/components/ui/tabs` (base-nova).
 */

import { BookIcon, GiftIcon, HeartIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  {
    name: "Explore",
    value: "explore",
    icon: <BookIcon />,
    content: (
      <>
        Discover{" "}
        <span className="font-semibold text-foreground">fresh ideas</span>,
        trending topics, and hidden gems curated just for you.
      </>
    ),
  },
  {
    name: "Favorites",
    value: "favorites",
    icon: <HeartIcon />,
    content: (
      <>
        All your{" "}
        <span className="font-semibold text-foreground">favorites</span> are
        saved here.
      </>
    ),
  },
  {
    name: "Surprise Me",
    value: "surprise",
    icon: <GiftIcon />,
    content: (
      <>
        <span className="font-semibold text-foreground">Surprise!</span>{" "}
        Here&apos;s something unexpected.
      </>
    ),
  },
] as const;

function TabsVerticalWithIconDemo() {
  return (
    <div className="w-full max-w-md">
      <Tabs defaultValue="explore" orientation="vertical">
        <TabsList className="h-full">
          {tabs.map(({ icon, name, value }) => (
            <TabsTrigger
              className="w-full gap-1.5 px-2.5 sm:px-3"
              key={value}
              value={value}
            >
              {icon}
              {name}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <p className="text-muted-foreground text-sm">{tab.content}</p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default TabsVerticalWithIconDemo;
