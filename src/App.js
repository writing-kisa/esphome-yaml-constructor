import validator from "@rjsf/validator-ajv8";
import schema from './schema.json';
import uiSchema from './uiSchema.json'
import Form from "@rjsf/mui";
import { Grid } from '@mui/material';
import YAML from 'yaml';
import * as React from 'react';
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';


const App = () => {
  const [formData, setFormData] = React.useState(null);
  const [seeData, setSseData] = React.useState([]);
  const [file_name, setFileName] = React.useState();
  const serverBaseURL = process.env.REACT_APP_API_URL;

  // Добавляем состояния для отслеживания доступности кнопок
  const [compileComplete, setCompileComplete] = React.useState(false);
  const [isValidateDisabled, setIsValidateDisabled] = React.useState(false);
  const [isCompileDisabled, setIsCompileDisabled] = React.useState(false);
  const [isDownloadDisabled, setIsDownloadDisabled] = React.useState(true);
  const [isFlashDisabled, setIsFlashDisabled] = React.useState(true);

  const [validateButtonColor, setValidateButtonColor] = React.useState('#DDDDDD');
  const [compileButtonColor, setCompileButtonColor] = React.useState('#DDDDDD');
  const [downloadButtonColor, setDownloadButtonColor] = React.useState('#AAAAAA');
  const [flashButtonColor, setFlashButtonColor] = React.useState('#AAAAAA');


  const handleSaveConfigAndClick = () => {
    handleSaveConfig()
    .then((data) => handleClick(data.file_name))
    .catch((error) => {
      console.error(error);
    });
  };

  const handleSaveConfig = () => {
    var yaml_text = JSON.stringify(formData);
    return fetch(`${serverBaseURL}/save_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: yaml_text
    })
      .then(response => response.json())
      .then(data => {
        // Update the state with the retrieved data
        console.log(data.file_name)
        setFileName(data.file_name);
        return data;
      });
  };

  const handleClick = (file_name) => {
    setSseData([]);
    setIsValidateDisabled(true);
    setIsCompileDisabled(true);
    setIsDownloadDisabled(true); // Disable the Download button
    setIsFlashDisabled(true); // Disable the Flash button
    setDownloadButtonColor('#AAAAAA');
    setFlashButtonColor('#AAAAAA');
    setValidateButtonColor('#AAAAAA'); // Disable the Validate button

    // Send data to the backend via POST
    fetch(`${serverBaseURL}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: file_name,
    })
        .then((response) => {
          const reader = response.body.getReader();
          let partial = '';
          return reader.read().then(function processResult(result) {
            const text = partial + new TextDecoder().decode(result.value || new Uint8Array(), {
              stream: !result.done,
            });
            const lines = text.split(/\r?\n/);
            partial = lines.pop() || '';
            console.log(lines.join('\n')); // console logs
            setSseData((prevData) => [...prevData, ...lines]);
            if (result.done) {
              setCompileComplete(true);
              setIsDownloadDisabled(false);
              setIsFlashDisabled(false);
              setDownloadButtonColor('#DDDDDD');
              setFlashButtonColor('#DDDDDD');
              setIsCompileDisabled(false);
              setIsValidateDisabled(false); // Enable the Validate button
              setValidateButtonColor('#DDDDDD'); // Set the Validate button color to its original color
              return;
            }
            return reader.read().then(processResult);
          });
        })
        .catch((error) => {
          console.error(error);
          setIsValidateDisabled(false);
          setIsCompileDisabled(false);
          setIsDownloadDisabled(false); // Enable the Download button if an error occurs
          setIsFlashDisabled(false); // Enable the Flash button if an error occurs
          setDownloadButtonColor('#DDDDDD');
          setFlashButtonColor('#DDDDDD');
          setValidateButtonColor('#DDDDDD'); // Set the Validate button color to its original color
        });
  };

  function getLogsValidate() {
    setSseData([]);
    var yaml_text = JSON.stringify(formData);
    fetch(`${serverBaseURL}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: yaml_text
    })
    .then(response => {
      const reader = response.body.getReader();
      let partial = '';
      return reader.read().then(function processResult(result) {
        const text = partial + new TextDecoder().decode(result.value || new Uint8Array, {stream: !result.done});
        const lines = text.split(/\r?\n/);
        partial = lines.pop() || '';
        console.log(lines.join('\n')); // console logs
        setSseData(prevData => [...prevData, ...lines]); // add logs to state
        if (result.done) {
          setIsValidateDisabled(false);
          return;
        }
        return reader.read().then(processResult);
      });
    })
    .catch(error => {
      console.error(error);
    });
  }

  //  Post request compile function that downloads a file
  const handleDownload = () => {
    fetch(`${serverBaseURL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: file_name
    })
      .then(response => {
        if (response.status === 404) {
          console.log('The configuration was not compiled')
          throw new Error('The configuration was not compiled')
        }
        return response.blob()
      })
      .then(blob => {
        // Saving the binary file as an object URL
        const url = URL.createObjectURL(blob);

        // Create a link to download a file
        const link = document.createElement('a');
        link.href = url;
        link.download = 'file.bin';

        // Programmatically click on the link to start the download
        link.click();
      });
  }

//---------------------------------------------------------
//  To switch between JSON Form and Logs

  const [value, setValue] = React.useState('1');

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

//---------------------------------------------------------
//  To make changes to a JSON Form and a yaml output form so that one doesn't override the other

  const [textAreaValue, setTextAreaValue] = React.useState(YAML.stringify(formData));

  const handleFormChange = ({ formData }) => {
    setFormData(formData);
    setTextAreaValue(YAML.stringify(formData));
  }

  const handleTextAreaChange = (event) => {
    const value = event.target.value;
    setTextAreaValue(value);

    try {
      const parsedData = YAML.parse(value);
      setFormData(parsedData);
    } catch (error) {
      console.error('Error parsing YAML', error);
      // Handle parse error, e.g. show error message to user.
    }
  }

//---------------------------------------------------------

  //  save the entered data in the form
  useEffect(() => {
    const data = window.localStorage.getItem(`MY_APP_STATE_${window.location.pathname}`);
    if (data !== null) setFormData(JSON.parse(data));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(`MY_APP_STATE_${window.location.pathname}`, JSON.stringify(formData));
  }, [formData]);

//---------------------------------------------------------
  // Share

  const [sharedLink, setSharedLink] = React.useState('');
  function handleLinkClick() {
    var json_text = JSON.stringify(formData);
    fetch(`${serverBaseURL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json_text
    })
    .then(response => response.json())
    .then(data => {
      // Save the shared link and update state
      setSharedLink(data.url);
    })
    .catch(error => {
      console.error(error);
    });
  }

  function displayChareFileData(uuid) {
    fetch(`${serverBaseURL}/share?file_name=${uuid}`, {
      method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
      // Update the state with the retrieved data
      console.log(data.json_text)
      setFormData(data.json_text);
    })
    .catch(error => {
      console.error(error);
    });
  }

  // getting information from the database if the url has a uuid
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    console.log(searchParams)
    const uuid = searchParams.get('uuid');
    console.log(uuid)
    if (uuid) {
      displayChareFileData(uuid);
    }
  }, []);


  // Update yaml config after going to url
  useEffect(() => {
    if (formData) {
      setTextAreaValue(YAML.stringify(formData));
    }
  }, [formData]);


  return (
      <Grid container spacing={2}>
  <Grid item xs={6}>
    <button
        onClick={getLogsValidate}
        style={{
          textAlign: 'center',
          width: '100px',
          border: '1px solid gray',
          borderRadius: '5px',
          backgroundColor: validateButtonColor,
        }}
        disabled={isValidateDisabled}
    >
      Validate
    </button>
    <button
        onClick={handleSaveConfigAndClick}
        style={{
          textAlign: 'center',
          width: '100px',
          border: '1px solid gray',
          borderRadius: '5px',
          backgroundColor: compileButtonColor,
        }}
        disabled={isCompileDisabled}
    >
      Compile
    </button>
    <button
        onClick={handleDownload}
        style={{
          textAlign: 'center',
          width: '100px',
          border: '1px solid gray',
          borderRadius: '5px',
          backgroundColor: downloadButtonColor,
        }}
        disabled={isDownloadDisabled}
    >
      Download BIN
    </button>
    <esp-web-install-button manifest={`${serverBaseURL}/manifest/${file_name}`}>
      <button
          slot="activate"
          style={{
            textAlign: 'center',
            width: '100px',
            border: '1px solid gray',
            borderRadius: '5px',
            backgroundColor: flashButtonColor,
          }}
          disabled={isFlashDisabled}
      >
        Flash
      </button>
    </esp-web-install-button>
    <Box
      component="form"
      sx={{
          '& .MuiTextField-root': { m: 1, width: '90ch' },
      }}
      noValidate
      autoComplete="off"
    >
      <div>
        <TextField
          id="standard-multiline-static"
          multiline
          rows={48}
          variant="standard"
          value={textAreaValue}
          onChange={handleTextAreaChange}
        />
      </div>
    </Box>
    <button onClick={handleLinkClick} style={{
      textAlign: 'center',
      width: '100px',
      border: '1px solid gray',
      borderRadius: '5px',
      backgroundColor: '#DDDDDD',
    }}>Share Link</button>
      {sharedLink && (
        <a href={sharedLink}>
          {sharedLink}
        </a>
      )}
  </Grid>
  <Grid item xs={6}>
    <Box sx={{ width: '100%', typography: 'body1' }}>
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <TabList onChange={handleChange} aria-label="lab API tabs example">
            <Tab label="Json Form" value="1" />
            <Tab label="Logs" value="2" />
          </TabList>
        </Box>
        <TabPanel value="1">
        <Form
          schema={schema}
          uiSchema={uiSchema}
          formData={formData}
          onChange={handleFormChange}
          validator={validator}
        />
        </TabPanel>
        <TabPanel value="2">
          {seeData.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </TabPanel>
      </TabContext>
    </Box>
  </Grid>
</Grid>


  );
};

export default App;