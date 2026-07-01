require('dotenv').config();
const pool = require('./db');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function run() {
  try {
    const [candidates] = await pool.query(`
      SELECT c.id, r.extracted_text, c.name
      FROM candidates c
      JOIN resumes r ON c.resume_id = r.id
    `);

    for (const candidate of candidates) {
      const text = candidate.extracted_text.substring(0, 15000); // limit tokens
      console.log(`Analyzing experience for ${candidate.name} (Candidate ID: ${candidate.id})...`);
      
      let attempts = 0;
      let totalExp = "0";
      
      while (attempts < 3) {
        try {
          const completion = await groq.chat.completions.create({
            messages: [
              { 
                role: 'system', 
                content: 'You are an AI that extracts total years of professional work experience from resumes. Look at the summary, profile, or calculate it from the experiences listed. Respond ONLY with a valid JSON object in this format: {"years": "5.5"} or {"years": "5+"} or {"years": "10+"}. If the resume explicitly mentions something like "5+ years", return it EXACTLY as "5+". Otherwise, calculate the total years precisely from the listed experiences (e.g. "6.2"). If it cannot be determined, output {"years": "0"}.'
              },
              { 
                role: 'user', 
                content: text 
              }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.1,
            response_format: { type: 'json_object' }
          });

          const resStr = completion.choices[0].message.content;
          const data = JSON.parse(resStr);
          totalExp = data.years ? String(data.years) : "0";
          break; // Success
        } catch (e) {
          attempts++;
          console.error(`Attempt ${attempts} failed for ${candidate.id}:`, e.message);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      console.log(`Found ${totalExp} years for ${candidate.name}. Updating database...`);
      await pool.query('UPDATE candidates SET total_experience_years = ? WHERE id = ?', [totalExp, candidate.id]);
    }
    
    console.log('Finished updating all candidates!');
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    process.exit();
  }
}

run();
