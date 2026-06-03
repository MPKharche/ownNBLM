import { motion } from "framer-motion"
import { BookOpenIcon, MessageSquareIcon, UploadIcon } from "lucide-react"

import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { chatMessageTransition, chatMessageVariants, useMotionSafe } from "@/lib/motion"

export function DashboardPage() {
  const motionSafe = useMotionSafe()

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <motion.section
        className="mx-4 rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center md:mx-6"
        variants={chatMessageVariants}
        initial={motionSafe.initial}
        animate={motionSafe.animate}
        transition={chatMessageTransition}
      >
        <UploadIcon className="mx-auto mb-3 size-10 text-muted" aria-hidden />
        <h2 className="font-heading text-xl font-semibold">Drop your first PDF here</h2>
        <p className="mt-2 text-sm text-muted">
          Phase 1 scaffold — ingest pipeline wires in the next milestone.
        </p>
      </motion.section>

      <SectionCards />

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <motion.div
          className="rounded-xl border border-border bg-card p-4"
          variants={chatMessageVariants}
          initial={motionSafe.initial}
          animate={motionSafe.animate}
          transition={{ ...chatMessageTransition, delay: 0.05 }}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BookOpenIcon className="size-4" aria-hidden />
            Corpus
          </div>
          <p className="text-sm text-muted-foreground">
            Sources and documents indexed for your workspace appear here.
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="progress-bar-fill h-full rounded-full bg-primary"
              style={{ width: "35%" }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Sample paper — indexed (seed stub)</p>
        </motion.div>

        <motion.div
          className="rounded-xl border border-border bg-card p-4"
          variants={chatMessageVariants}
          initial={motionSafe.initial}
          animate={motionSafe.animate}
          transition={{ ...chatMessageTransition, delay: 0.1 }}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MessageSquareIcon className="size-4" aria-hidden />
            Sessions
          </div>
          <p className="text-sm text-muted-foreground">
            Agentic RAG chat with citations ships in the retrieval-agent milestone.
          </p>
        </motion.div>
      </div>

      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
    </div>
  )
}
