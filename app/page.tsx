"use client";

import axios from "axios";
import { type FC, useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 6000;
const CATEGORY_FILTER_OPTIONS = ["all", "technology", "business", "science", "health", "sports", "politics", "entertainment", "other"] as const;
const STATUS_FILTER_OPTIONS = ["all", "pending", "processing", "completed", "failed"] as const;

const HomePage: FC = () => {
	const [urlInput, setUrlInput] = useState("");
	const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORY_FILTER_OPTIONS)[number]>("all");
	const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTER_OPTIONS)[number]>("all");
	const [items, setItems] = useState<ContentItem[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const loadContent = useCallback(async () => {
		setIsLoading(true);
		setErrorMessage(null);

		try {
			const response = await axios.get<ContentListResponse>("/api/content", {
				params: {
					limit: 50,
					category: categoryFilter === "all" ? undefined : categoryFilter,
					processingStatus: statusFilter === "all" ? undefined : statusFilter
				}
			});

			setItems(response.data.data);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, "Failed to load content records."));
		} finally {
			setIsLoading(false);
		}
	}, [categoryFilter, statusFilter]);

	useEffect(() => {
		void loadContent();
	}, [loadContent]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			void loadContent();
		}, POLL_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
		};
	}, [loadContent]);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
		event.preventDefault();
		setErrorMessage(null);
		setSuccessMessage(null);

		if (!urlInput.trim()) {
			setErrorMessage("Please enter a URL.");
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await axios.post<IngestResponse>("/api/ingest", {
				url: urlInput.trim()
			});

			setSuccessMessage(response.data.message);
			setUrlInput("");
			await loadContent();
		} catch (error) {
			setErrorMessage(getErrorMessage(error, "Failed to submit URL."));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Content Ingestion Service</h1>
				<p className="text-sm text-zinc-600 dark:text-zinc-300">
					Submit a URL, track processing status, and browse AI-generated summaries.
				</p>
			</header>

			<IngestForm
				urlInput={urlInput}
				isSubmitting={isSubmitting}
				onUrlChange={setUrlInput}
				onSubmit={handleSubmit}
			/>

			<FilterBar
				categoryFilter={categoryFilter}
				statusFilter={statusFilter}
				onCategoryChange={setCategoryFilter}
				onStatusChange={setStatusFilter}
				onRefresh={loadContent}
				isLoading={isLoading}
			/>

			<StatusBanner errorMessage={errorMessage} successMessage={successMessage} />

			<ContentList items={items} isLoading={isLoading} />
		</main>
	);
};

export default HomePage;

const IngestForm: FC<IngestFormProps> = ({ urlInput, isSubmitting, onUrlChange, onSubmit }) => {
	return (
		<form onSubmit={onSubmit} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
			<label htmlFor="url-input" className="mb-2 block text-sm font-medium">
				Article URL
			</label>
			<div className="flex flex-col gap-3 sm:flex-row">
				<input
					id="url-input"
					type="url"
					value={urlInput}
					onChange={(event) => onUrlChange(event.target.value)}
					placeholder="https://example.com/article"
					className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
					required
				/>
				<button
					type="submit"
					disabled={isSubmitting}
					className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
				>
					{isSubmitting ? "Submitting..." : "Ingest URL"}
				</button>
			</div>
		</form>
	);
};

const FilterBar: FC<FilterBarProps> = ({
	categoryFilter,
	statusFilter,
	onCategoryChange,
	onStatusChange,
	onRefresh,
	isLoading
}) => {
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center dark:border-zinc-800">
			<div className="flex flex-1 flex-col gap-3 sm:flex-row">
				<select
					value={categoryFilter}
					onChange={(event) => onCategoryChange(event.target.value as (typeof CATEGORY_FILTER_OPTIONS)[number])}
					className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
				>
					{CATEGORY_FILTER_OPTIONS.map((category) => (
						<option key={category} value={category}>
							Category: {category}
						</option>
					))}
				</select>
				<select
					value={statusFilter}
					onChange={(event) => onStatusChange(event.target.value as (typeof STATUS_FILTER_OPTIONS)[number])}
					className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
				>
					{STATUS_FILTER_OPTIONS.map((status) => (
						<option key={status} value={status}>
							Status: {status}
						</option>
					))}
				</select>
			</div>
			<button
				type="button"
				onClick={() => void onRefresh()}
				disabled={isLoading}
				className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
			>
				{isLoading ? "Refreshing..." : "Refresh"}
			</button>
		</section>
	);
};

const StatusBanner: FC<StatusBannerProps> = ({ errorMessage, successMessage }) => {
	if (!errorMessage && !successMessage) {
		return null;
	}

	if (errorMessage) {
		return (
			<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
				{errorMessage}
			</div>
		);
	}

	return (
		<div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
			{successMessage}
		</div>
	);
};

const ContentList: FC<ContentListProps> = ({ items, isLoading }) => {
	if (isLoading && items.length === 0) {
		return <p className="text-sm text-zinc-500">Loading records...</p>;
	}

	if (!items.length) {
		return <p className="text-sm text-zinc-500">No content records found for the selected filters.</p>;
	}

	return (
		<section className="grid gap-3">
			{items.map((item) => (
				<ContentCard key={item.id} item={item} />
			))}
		</section>
	);
};

const ContentCard: FC<ContentCardProps> = ({ item }) => {
	const confidenceText = item.confidence_score != null ? `${Math.round(item.confidence_score * 100)}%` : "N/A";

	return (
		<article className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
			<div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
				<div className="space-y-1">
					<h2 className="text-lg font-medium">{item.title ?? item.url}</h2>
					<a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
						{item.url}
					</a>
				</div>
				<StatusPill status={item.processing_status} />
			</div>

			<div className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
				<p>
					<strong>Category:</strong> {item.category ?? "N/A"}
				</p>
				<p>
					<strong>Confidence:</strong> {confidenceText}
				</p>
				<p>
					<strong>Author:</strong> {item.author ?? "N/A"}
				</p>
				<p>
					<strong>Publish Date:</strong> {formatDate(item.publish_date)}
				</p>
			</div>

			{item.summary ? <p className="text-sm text-zinc-800 dark:text-zinc-200">{item.summary}</p> : null}

			{item.needs_review ? (
				<p className="rounded-md bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
					Needs review due to low confidence score.
				</p>
			) : null}

			{item.processing_error_message ? (
				<p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
					{item.processing_error_message}
				</p>
			) : null}
		</article>
	);
};

const StatusPill: FC<StatusPillProps> = ({ status }) => {
	const statusMetadata = getStatusMetadata(status);

	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusMetadata.className}`}>
			<StatusIcon status={status} />
			{statusMetadata.label}
		</span>
	);
};

const StatusIcon: FC<StatusIconProps> = ({ status }) => {
	if (status === "completed") {
		return (
			<svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
				<path
					fill="currentColor"
					d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.2 7.2a1 1 0 0 1-1.4 0L4.3 10a1 1 0 0 1 1.4-1.4l3.1 3.1 6.5-6.4a1 1 0 0 1 1.4 0Z"
				/>
			</svg>
		);
	}

	if (status === "processing") {
		return (
			<svg viewBox="0 0 20 20" className="h-3.5 w-3.5 animate-spin" aria-hidden>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M10 3a7 7 0 1 0 7 7 1 1 0 1 1 2 0A9 9 0 1 1 10 1a1 1 0 1 1 0 2Z"
					clipRule="evenodd"
				/>
			</svg>
		);
	}

	if (status === "failed") {
		return (
			<svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
				<path
					fill="currentColor"
					d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm3.7 4.3a1 1 0 0 0-1.4 0L10 8.6 7.7 6.3a1 1 0 1 0-1.4 1.4L8.6 10l-2.3 2.3a1 1 0 1 0 1.4 1.4L10 11.4l2.3 2.3a1 1 0 0 0 1.4-1.4L11.4 10l2.3-2.3a1 1 0 0 0 0-1.4Z"
				/>
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
			<path
				fill="currentColor"
				d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4a1 1 0 0 0-1 1v3.4a1 1 0 0 0 .3.7l2 2a1 1 0 0 0 1.4-1.4L11 9.9V7a1 1 0 0 0-1-1Z"
			/>
		</svg>
	);
};

function getStatusMetadata(status: ContentItem["processing_status"]): StatusMetadata {
	if (status === "completed") {
		return {
			label: "completed",
			className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
		};
	}

	if (status === "processing") {
		return {
			label: "processing",
			className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
		};
	}

	if (status === "failed") {
		return {
			label: "failed",
			className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
		};
	}

	return {
		label: "pending",
		className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
	};
}

function formatDate(value: string | null): string {
	if (!value) {
		return "N/A";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "N/A";
	}

	return date.toLocaleString();
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
	if (!axios.isAxiosError(error)) {
		return fallbackMessage;
	}

	if (typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}

	return fallbackMessage;
}

interface IngestFormProps {
	urlInput: string;
	isSubmitting: boolean;
	onUrlChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

interface FilterBarProps {
	categoryFilter: (typeof CATEGORY_FILTER_OPTIONS)[number];
	statusFilter: (typeof STATUS_FILTER_OPTIONS)[number];
	onCategoryChange: (value: (typeof CATEGORY_FILTER_OPTIONS)[number]) => void;
	onStatusChange: (value: (typeof STATUS_FILTER_OPTIONS)[number]) => void;
	onRefresh: () => Promise<void>;
	isLoading: boolean;
}

interface StatusBannerProps {
	errorMessage: string | null;
	successMessage: string | null;
}

interface ContentListProps {
	items: ContentItem[];
	isLoading: boolean;
}

interface ContentCardProps {
	item: ContentItem;
}

interface StatusPillProps {
	status: ContentItem["processing_status"];
}

interface StatusIconProps {
	status: ContentItem["processing_status"];
}

interface StatusMetadata {
	label: string;
	className: string;
}

interface IngestResponse {
	id: string;
	url: string;
	processingStatus: "pending" | "processing" | "completed" | "failed";
	message: string;
}

interface ContentListResponse {
	data: ContentItem[];
	count: number;
}

interface ContentItem {
	id: string;
	url: string;
	title: string | null;
	author: string | null;
	publish_date: string | null;
	summary: string | null;
	category: string | null;
	confidence_score: number | null;
	needs_review: boolean;
	processing_status: "pending" | "processing" | "completed" | "failed";
	processing_error_message: string | null;
	created_at: string;
}
