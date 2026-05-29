## Observations/Problems

- "back" button doesn't go back to the previous page, it just redoes the last action. for example, if user clicks generate artificats, page reloads, artificats appear, and clicking back just shows the popup message again. have to click back a few times before going to the previous PAGe. logic is flaud. It seems like we still have flawed logic in our back button. For example when we generate artifacts for a specific job application, our web app reloads the page when these artifacts are successfully generated. When the user wants to click the back button to be sent back to whatever previous page he was on, which would be the job detail and overview of that job posting, instead we have to click twice to go back to that page. Our logic is still flawed and we need to fix it 
- entering the country code for the phone number is successful first time, then it deletes selection, then enters the users PHONE NUMBER in the country code field. ultimately it works out because some of these boards auto detect it. this observation is specific to greenhouse. (DONE)

- Still need to make sure to explicitly mention that the model needs to choose one of the options for the combo box fields and we need to check if we are actually sending all the options for all the combo box fields on the job application being automated. 

- 