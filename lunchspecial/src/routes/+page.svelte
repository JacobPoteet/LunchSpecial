<script lang="ts">
    import { onMount } from 'svelte';
    import IngredientList from './IngredientList.svelte';
    import Guess from './Guess.svelte';
    import ClueList from './ClueList.svelte';
    import './app.css'; 
    import './models/Recipe.ts';

    let recipesJson = `
    [
        {
            "name": "Pancakes",
            "ingredients": ["Flour", "Eggs", "Milk"],
            "clues": ["Mix ingredients", "Cook on pan"]
        },
        {
            "name": "Scrambled Eggs",
            "ingredients": ["Eggs", "Butter", "Salt"],
            "clues": ["Beat eggs", "Cook in pan with butter"]
        }
    ]
    `;

    let recipes = JSON.parse(recipesJson);

    let currentRecipeIndex = 0;
    let currentIngredientIndex = 0;
    let currentClueIndex = 0;
    let currentIngredients: string[] = [];
    let currentClues: string[] = [];

    onMount(() => {
        resetCurrentIngredients();
        console.log('Mounted. Current Ingredients:', currentIngredients);
    });

    function resetGame() {
        currentRecipeIndex = 0;
        resetCurrentIngredients();
    }

    function requestClue() {
        console.log('Requesting clue.');
        if(currentClueIndex + 1 === recipes[currentRecipeIndex].clue.length) {
            console.log('No more clues available for this recipe.');
            return;
        }
        else
        {
            currentClueIndex++;
            currentClues = [...currentClues, recipes[currentRecipeIndex].clue[currentClueIndex]];
            console.log('New Clue Added. Current Clues:', currentClues);
        }
    }

    function resetCurrentIngredients() {
        currentIngredientIndex = 0;
        currentIngredients = [];
        updateCurrentIngredients();
    }

    function updateCurrentIngredients() {
        currentIngredients = [...currentIngredients, recipes[currentRecipeIndex].ingredients[currentIngredientIndex]];
    }

    function handleGuess(event: any) {
        if (event.detail === recipes[currentRecipeIndex].name) {
            resetCurrentIngredients();
            console.log('Correct guess. Moving to next recipe.');
        } else {
            if(currentIngredientIndex + 1 === recipes[currentRecipeIndex].ingredients.length) {
                console.log('No more ingredients available for this recipe.');
                return;
            }
            else
            {
                currentIngredientIndex++;
                updateCurrentIngredients();
                console.log('Incorrect guess. Moving to next clue. Current Ingredients:', currentIngredients);
            }
        }
    }

</script>

<IngredientList bind:ingredients={currentIngredients} />
<Guess on:submitGuess={handleGuess} />

<ClueList bind:clues={currentClues} />
<button on:click={requestClue}>Request Clue</button>