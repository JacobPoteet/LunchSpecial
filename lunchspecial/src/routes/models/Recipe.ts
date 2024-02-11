class Recipe {
    name: string;
    ingredients: string[];
    clues: string[];

    constructor(name: string, ingredients: string[], clues: string[]) {
        this.name = name;
        this.ingredients = ingredients;
        this.clues = clues;
    }

    static fromJSON(json: any): Recipe {
        return new Recipe(json.name, json.ingredients, json.clues);
    }

    
}

let recipesJson = `
[
    {
        "name": "Pancakes",
        "ingredients": ["Flour", "Eggs", "Milk"],
        "clues": ["Mix ingredients", "Cook on pan"]
    }
]
`;
