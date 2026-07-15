import { createGuest } from "@/app/admin/actions";
import { Card, buttonStyles, inputStyles } from "@/components/ui";

export default function NewGuestPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-3xl font-semibold">New guest</h1>
      <p className="mt-1 text-ink-soft">
        The storyteller whose episodes this will be.
      </p>

      <Card className="mt-6 p-8">
        <form action={createGuest} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Name *
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Margaret Chen"
              className={inputStyles}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              About them
            </label>
            <textarea
              name="bio"
              rows={3}
              placeholder="Anything the interviewer should know — where they grew up, career, family…"
              className={inputStyles}
            />
            <p className="mt-1 text-xs text-ink-faint">
              This is shared with the AI host so its questions feel personal.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Favourite subjects
            </label>
            <input
              name="topics"
              placeholder="childhood, the bakery, immigration, grandchildren"
              className={inputStyles}
            />
            <p className="mt-1 text-xs text-ink-faint">Comma-separated.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Interview language
            </label>
            <input
              name="language"
              defaultValue="English"
              className={inputStyles}
            />
          </div>
          <button type="submit" className={`${buttonStyles.primary} w-full`}>
            Create guest
          </button>
        </form>
      </Card>
    </div>
  );
}
