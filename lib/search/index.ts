// lib/search/index.ts

// Export search service
export {
  TaskSearchService,
  getSearchService,
  searchTodos,
  type SearchOptions,
  type SearchResult
} from './searchService';

// Export search utilities
export {
  SearchQueryBuilder,
  SearchResultFilter,
  SearchResultSorter,
  SearchHighlighter,
  SearchHistoryManager
} from './searchUtils';

// Export debounce hook
export { useDebounce } from '../hooks/useDebounce';