const express = require("express")
const axios = require("axios")
const router = express.Router()

router.post("/ai/chat", async(req, res) => {
    try{
        const response = await axios.post("http://localhost:8000/api/ai/chat", {
            userQuery: req.body.userQuery
        })

        res.json(response.data)
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to fetch AI response"})
    }
})

module.exports = router;