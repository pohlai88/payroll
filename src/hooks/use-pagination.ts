interface UsePaginationProps {
  currentPage: number;
  totalPages: number;
  paginationItemsToDisplay: number;
}

interface UsePaginationReturn {
  pages: number[];
  showLeftEllipsis: boolean;
  showRightEllipsis: boolean;
}

export function usePagination({
  currentPage,
  totalPages,
  paginationItemsToDisplay,
}: UsePaginationProps): UsePaginationReturn {
  function calculatePaginationRange(): number[] {
    if (totalPages <= paginationItemsToDisplay) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const halfDisplay = Math.floor(paginationItemsToDisplay / 2);

    const initialRange = {
      start: currentPage - halfDisplay,
      end: currentPage + halfDisplay,
    };

    const adjustedRange = {
      start: Math.max(1, initialRange.start),
      end: Math.min(totalPages, initialRange.end),
    };

    if (adjustedRange.start === 1) {
      adjustedRange.end = Math.min(paginationItemsToDisplay, totalPages);
    }

    if (adjustedRange.end === totalPages) {
      adjustedRange.start = Math.max(
        1,
        totalPages - paginationItemsToDisplay + 1
      );
    }

    return Array.from(
      { length: adjustedRange.end - adjustedRange.start + 1 },
      (_, i) => adjustedRange.start + i
    );
  }

  const pages = calculatePaginationRange();

  // Determine ellipsis display based on the actual pages shown
  const firstPage = pages[0];
  const lastPage = pages.at(-1);
  const showLeftEllipsis =
    pages.length > 0 &&
    firstPage !== undefined &&
    firstPage > 1 &&
    firstPage > 2;

  const showRightEllipsis =
    pages.length > 0 &&
    lastPage !== undefined &&
    lastPage < totalPages &&
    lastPage < totalPages - 1;

  return {
    pages,
    showLeftEllipsis,
    showRightEllipsis,
  };
}
