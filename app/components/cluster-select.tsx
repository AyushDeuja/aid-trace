"use client";

import { Check, ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCluster, CLUSTERS } from "./cluster-context";

export function ClusterSelect() {
  const { cluster, setCluster } = useCluster();
  const displayCluster = cluster[0]?.toUpperCase() + cluster.slice(1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full border-cyan-300 bg-cyan-100/80 px-3 text-cyan-950 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-950"
          aria-label="Select Solana network"
        >
          <Zap className="text-cyan-700 dark:text-cyan-300" />
          <span>{displayCluster} · live</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={cluster}
          onValueChange={(value) => setCluster(value as typeof cluster)}
        >
          {CLUSTERS.map((item) => (
            <DropdownMenuRadioItem value={item} key={item}>
              <span className="size-2 rounded-full bg-emerald-500" />
              {item}
              {item === cluster && <Check className="ml-auto" />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
