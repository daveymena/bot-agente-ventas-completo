const str = "🎯 ¡Hola *Test*! a *TecnoVariedades D&S*! 🔥\nSomos especialistas en cursos y megapacks digitales.\n\n¿Qué tipo de contenido estás buscando? 😊";
let s = str.replace(/¿[^?]*\?\s*😊/g, "Aquí estamos listos para mostrarte lo que tenemos para ti. 😊");
console.log("Result 1:", s);
s = s.replace(/¿[^?]*\?/g, "");
console.log("Result 2:", s);
