import { Card } from "./card";
import { Avatar } from "./avatar";
import { shortDate, timeOfDay } from "@/lib/domain/format";

export type ActivityEntry = { id: string; createdAt: string; actorName: string; entityType: string; summary: string };

const entityLabels: Record<string, string> = { client: "Client", property: "Site", request: "Request", quote: "Quote", job: "Job", invoice: "Invoice", visit: "Visit", expense: "Expense", time_entry: "Time", payment: "Payment" };

/** Who changed what and when. Admin-only data; render nothing for an empty list the caller could not read. */
export function ActivityFeed({ items, title = "Activity", showEntity = false }: { items: ActivityEntry[]; title?: string; showEntity?: boolean }) {
  return (
    <Card title={title} count={items.length || undefined} flush>
      {items.length ? (
        <ol className="activity-feed">
          {items.map(item => (
            <li key={item.id}>
              <Avatar name={item.actorName} />
              <div>
                <p><strong>{item.actorName}</strong> · {item.summary}</p>
                <small>{showEntity ? `${entityLabels[item.entityType] ?? item.entityType} · ` : ""}<time dateTime={item.createdAt}>{shortDate(item.createdAt)} {timeOfDay(item.createdAt)}</time></small>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="record-list-empty">No recorded activity yet.</p>}
    </Card>
  );
}
