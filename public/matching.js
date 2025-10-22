// Sophisticated Keyword Matching Logic for Prediction Markets

/**
 * Check if two words match based on exact match rules
 * Simple case-insensitive exact string match (ignoring punctuation)
 */
function exactMatchWords(keyword, word) {
    // Remove punctuation and normalize
    const normalize = (str) => str.toLowerCase().trim().replace(/[^\w\s]/g, '');

    return normalize(keyword) === normalize(word);
}

/**
 * Check if two words match with fuzzy logic
 * Includes typos, transliterations, transcription errors
 */
function fuzzyMatchWords(keyword, word) {
    // First check exact match rules
    if (exactMatchWords(keyword, word)) {
        return true;
    }

    const normalize = (str) => str.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const cleanKeyword = normalize(keyword);
    const cleanWord = normalize(word);

    // Don't fuzzy match very short words (3 chars or less) - too many false positives
    if (cleanKeyword.length <= 3) {
        return false;
    }

    // Levenshtein distance for typos
    const distance = levenshteinDistance(cleanKeyword, cleanWord);
    const maxLength = Math.max(cleanKeyword.length, cleanWord.length);
    const minLength = Math.min(cleanKeyword.length, cleanWord.length);

    // Only fuzzy match if lengths are similar (within 2 chars)
    if (Math.abs(cleanKeyword.length - cleanWord.length) > 2) {
        return false;
    }

    // Allow 1-2 character difference for typos/transliteration
    // But require word to be at least 4 characters
    if (minLength >= 4 && maxLength <= 6 && distance <= 1) {
        return true; // Short words: 1 char difference
    }
    if (minLength >= 5 && distance <= 2) {
        return true; // Longer words: 2 char difference
    }

    return false;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[len1][len2];
}


/**
 * Main matching function
 */
function matchesKeyword(keyword, word, isExactMode) {
    if (isExactMode) {
        return exactMatchWords(keyword, word);
    } else {
        return fuzzyMatchWords(keyword, word);
    }
}

/**
 * Check if a keyword phrase matches a sequence of words
 * For multi-word keywords like "Donald Trump"
 * SIMPLIFIED VERSION - just use substring matching
 */
function matchesPhraseInText(keyword, text, isExactMode) {
    // Normalize: lowercase, remove punctuation, and remove extra whitespace
    const normalize = (str) => str.toLowerCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');

    const cleanKeyword = normalize(keyword);
    const cleanText = normalize(text);

    console.log('[matchesPhraseInText] Searching for:', cleanKeyword);
    console.log('[matchesPhraseInText] In text:', cleanText.substring(0, 100) + '...');

    if (isExactMode) {
        // Simple case-insensitive substring match - that's it!
        const found = cleanText.includes(cleanKeyword);
        console.log('[matchesPhraseInText] Exact mode result:', found);
        return found;
    } else {
        // For fuzzy mode, first try exact substring match
        if (cleanText.includes(cleanKeyword)) {
            console.log('[matchesPhraseInText] Fuzzy mode: found exact match');
            return true;
        }

        // Then try word-by-word fuzzy matching
        const keywordWords = cleanKeyword.split(/\s+/);
        const textWords = cleanText.split(/\s+/);

        // If single word, check each word in text
        if (keywordWords.length === 1) {
            const found = textWords.some(word => fuzzyMatchWords(keywordWords[0], word));
            console.log('[matchesPhraseInText] Fuzzy mode (single word) result:', found);
            return found;
        }

        // For multi-word phrases, check if all words appear in sequence with fuzzy matching
        for (let i = 0; i <= textWords.length - keywordWords.length; i++) {
            let allMatch = true;
            for (let j = 0; j < keywordWords.length; j++) {
                if (!fuzzyMatchWords(keywordWords[j], textWords[i + j])) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                console.log('[matchesPhraseInText] Fuzzy mode (multi-word) found at position:', i);
                return true;
            }
        }

        console.log('[matchesPhraseInText] Fuzzy mode: no match found');
        return false;
    }
}
